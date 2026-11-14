#!/usr/bin/env python3
"""
Verifica el uso del esquema sin compilar ni conectarse a la base.

Existe porque la semilla se escribe en un entorno sin node_modules ni
PostgreSQL: sin esto, un campo mal escrito o una clave compuesta inventada
solo aparece cuando la corrida lleva media hora. Contrasta cada escritura de
Prisma contra schema.prisma: que el modelo exista, que el `where` use una
clave realmente unique, que todo campo enviado exista, y que ningun `create`
omita un campo obligatorio sin default.

Uso:  python3 prisma/demo/check-schema-usage.py prisma/demo/*.ts prisma/seed.ts
      (el SQL del reset se revisa siempre, no hace falta pasarlo)
"""
import re, sys
schema = open('prisma/schema.prisma').read()
models, uniques = {}, {}
for m in re.finditer(r'^model (\w+) \{(.*?)^\}', schema, re.S | re.M):
    name, body = m.group(1), m.group(2)
    models[name] = set(re.findall(r'^\s{2}(\w+)\s+\w', body, re.M))
    us = ['_'.join(x.strip() for x in u.split(',')) for u in re.findall(r'@@unique\(\[([^\]]+)\]', body)]
    us += ['_'.join(x.strip() for x in u.split(',')) for u in re.findall(r'@@id\(\[([^\]]+)\]', body)]
    us += re.findall(r'^\s{2}(\w+)\s+\w+[^\n]*@unique', body, re.M)
    uniques[name] = set(us)

def pascal(x): return x[0].upper() + x[1:]

def balanced(src, i):
    """Devuelve el contenido del objeto que abre en src[i] == '{'."""
    depth, j = 0, i
    while j < len(src):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0: return src[i+1:j], j
        j += 1
    raise ValueError('sin cerrar')

def top_keys(obj):
    """Claves de primer nivel, incluyendo propiedades abreviadas (`campo,`)."""
    segments, depth, start = [], 0, 0
    for i, c in enumerate(obj):
        if c in '{[(': depth += 1
        elif c in '}])': depth -= 1
        elif c == ',' and depth == 0:
            segments.append(obj[start:i]); start = i + 1
    segments.append(obj[start:])
    keys = []
    for seg in segments:
        seg = seg.strip()
        if not seg or seg.startswith('//') or seg.startswith('...'): continue
        seg = re.sub(r'^(?://.*\n)+', '', seg).strip()
        m = re.match(r'(\w+)\s*:', seg)
        if m: keys.append(m.group(1))
        elif re.fullmatch(r'\w+', seg): keys.append(seg)
    return keys

def sub_object(obj, key):
    m = re.search(r'\b'+key+r':\s*\{', obj)
    if not m: return None
    return balanced(obj, m.end()-1)[0]

fails = []
for path in sys.argv[1:]:
    src = open(path).read()
    writes = 0
    for m in re.finditer(r'\b(?:db|tx)\.(\w+)\.(upsert|create|update|updateMany|createMany)\(\s*\{', src):
        model = pascal(m.group(1))
        if model not in models:
            fails.append(f'{path}: modelo inexistente {model}'); continue
        obj, _ = balanced(src, m.end()-1)
        writes += 1
        # clave del where
        where = sub_object(obj, 'where')
        if where:
            for k in top_keys(where):
                if k not in uniques[model] and k not in models[model]:
                    fails.append(f'{path}: {model}.where.{k} no es unique ni campo (uniques: {sorted(uniques[model])})')
        for section in ('data', 'create', 'update'):
            body = sub_object(obj, section)
            if body is None: continue
            for k in top_keys(body):
                if k not in models[model]:
                    fails.append(f'{path}: {model}.{section}.{k} no existe')
    print(f'{path}: {writes} escrituras verificadas')
print('\n'.join(sorted(set(fails))) if fails else 'Todos los modelos, claves y campos existen en el esquema.')

# --- campos obligatorios ausentes en los create ---
required = {}
for m in re.finditer(r'^model (\w+) \{(.*?)^\}', schema, re.S | re.M):
    name, body = m.group(1), m.group(2)
    req = []
    for line in body.splitlines():
        fm = re.match(r'\s{2}(\w+)\s+(\w+)(\[\])?(\?)?(.*)$', line)
        if not fm: continue
        field, typ, lst, opt, rest = fm.groups()
        if lst or opt: continue
        if '@default' in rest or '@id' in rest or '@updatedAt' in rest or '@relation' in rest: continue
        if typ in models or typ in ('Json',) and False: continue
        req.append(field)
    required[name] = req

missing = []
for path in sys.argv[1:]:
    src = open(path).read()
    for m in re.finditer(r'\b(?:db|tx)\.(\w+)\.(upsert|create)\(\s*\{', src):
        model = pascal(m.group(1))
        if model not in models: continue
        obj, _ = balanced(src, m.end()-1)
        body = sub_object(obj, 'create') if m.group(2) == 'upsert' else sub_object(obj, 'data')
        if body is None: continue
        provided = set(top_keys(body))
        for field in required[model]:
            # una relación anidada cubre su FK (perfil: { create: {} } cubre usuarioId)
            if field not in provided and field.replace('Id','') not in provided:
                missing.append(f'{path}: {model}.create no envía "{field}" (obligatorio sin default)')
print('\n'.join(sorted(set(missing))) if missing else 'Ningún create omite un campo obligatorio.')

# --- rutas de importación ---------------------------------------------------
# Las rutas al código de la app se escribieron sin poder resolverlas: este
# chequeo las contrasta con el arbol real. Las de src/generated se omiten
# porque las crea `prisma generate` y no existen hasta entonces.
import os, glob
rotas = []
for f in sorted(glob.glob('prisma/demo/*.ts')) + ['prisma/seed.ts', 'prisma/seed-roles.ts']:
    if not os.path.isfile(f): continue
    for imp in re.findall(r"from '(\.[^']+)'", open(f, encoding='utf-8').read()):
        if 'src/generated/' in imp: continue
        real = os.path.normpath(os.path.join(os.path.dirname(f), imp)).replace('.js', '.ts')
        if not os.path.isfile(real): rotas.append(f'{f} -> {imp}')
print('\n'.join('ruta inexistente: ' + r for r in rotas) if rotas else 'Todas las rutas de importación resuelven.')

# --- filtros where, en profundidad y también en las lecturas -----------------
# El bloque de arriba solo miraba las escrituras, y solo el primer nivel del
# where. Un findFirst sobre `usuarioRoles` —que en este esquema se llama
# `usuarioRolesComoUsuario`, porque las relaciones inversas llevan el sufijo
# del campo que las origina— pasaba sin que nadie dijera nada. Esto recorre
# cada where entrando por las relaciones, con el modelo que corresponde a cada
# salto. Limitación: toma el where de primer nivel de cada llamada, no los que
# van dentro de una escritura anidada.
relations = {}
for m in re.finditer(r'^model (\w+) \{(.*?)^\}', schema, re.S | re.M):
    relations[m.group(1)] = {
        f: t for f, t in re.findall(r'^\s{2}(\w+)\s+(\w+)', m.group(2), re.M) if t in models
    }

OPS = {'AND', 'OR', 'NOT', 'some', 'every', 'none', 'is', 'isNot'}       # siguen en el modelo
LEAF = {'equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains',
        'startsWith', 'endsWith', 'mode', 'search', 'has', 'hasEvery', 'hasSome', 'isEmpty'}

def top_entries(obj):
    """[(clave, texto del valor)] del primer nivel."""
    out, depth, start = [], 0, 0
    segs = []
    for i, c in enumerate(obj):
        if c in '{[(': depth += 1
        elif c in '}])': depth -= 1
        elif c == ',' and depth == 0:
            segs.append(obj[start:i]); start = i + 1
    segs.append(obj[start:])
    for seg in segs:
        seg = re.sub(r'^(?:\s*//.*\n)+', '', seg).strip()
        if not seg or seg.startswith('...'): continue
        m = re.match(r'(\w+)\s*:\s*(.*)', seg, re.S)
        if m: out.append((m.group(1), m.group(2).strip()))
        elif re.fullmatch(r'\w+', seg): out.append((seg, ''))
    return out

def check_where(path, model, obj, trail):
    for key, value in top_entries(obj):
        inner = balanced(value, 0)[0] if value.startswith('{') else None
        if key in LEAF: continue
        if key in OPS:
            if inner is not None: check_where(path, model, inner, trail)
            continue
        if key in uniques.get(model, ()) and '_' in key:        # clave compuesta
            if inner is not None:
                for part, _ in top_entries(inner):
                    if part not in models[model]:
                        fails2.append(f'{path}: {trail}.{key}.{part} no existe en {model}')
            continue
        if key not in models.get(model, ()):
            near = [f for f in models.get(model, ()) if f.lower().startswith(key.lower()[:6])]
            hint = f' ¿{near[0]}?' if near else ''
            fails2.append(f'{path}: {trail}.{key} no existe en {model}.{hint}')
            continue
        target = relations.get(model, {}).get(key)
        if target and inner is not None:
            check_where(path, target, inner, f'{trail}.{key}')

fails2, checked = [], 0
READS = r'find(?:First|Unique|Many)|count|aggregate|groupBy|delete|deleteMany|update|updateMany|upsert'
for path in sys.argv[1:]:
    src = open(path, encoding='utf-8').read()
    for m in re.finditer(r'\b(?:db|tx)\.(\w+)\.(?:' + READS + r')\(\s*\{', src):
        model = pascal(m.group(1))
        if model not in models: continue
        obj, _ = balanced(src, m.end() - 1)
        for key, value in top_entries(obj):
            if key == 'where' and value.startswith('{'):
                checked += 1
                check_where(path, model, balanced(value, 0)[0], f'{model}.where')
print(f'{checked} filtros where recorridos')
print('\n'.join(sorted(set(fails2))) if fails2 else 'Todas las claves de los where existen en su modelo.')

# --- SQL crudo del reset ----------------------------------------------------
# reset.ts no pasa por el cliente de Prisma: son 74 DELETE escritos a mano,
# y hasta ahora nadie los contrastaba con nada. Un `sucursalId` en una tabla
# que se ancla por `cuentaId` solo aparecia al ejecutar el reset, que es
# justo cuando ya no se puede volver atras. Esto expande las plantillas,
# resuelve los alias y exige que cada columna exista en la tabla que le
# corresponde.
reset_src = open('prisma/demo/reset.ts', encoding='utf-8').read()
def sql_template(src, i):
    """Cuerpo de la plantilla que abre en src[i] == '`', con ${} anidados.

    Las sentencias que arman listas de nombres contienen plantillas dentro de
    la interpolación, y un regex hasta el siguiente backtick las parte por la
    mitad: aparecían como "interpolación no expandida", que era el verificador
    rindiéndose, no un error del SQL.
    """
    depth, j = 0, i + 1
    while j < len(src):
        if src[j] == '\\': j += 2; continue
        if src[j:j+2] == '${': depth += 1; j += 2; continue
        if src[j] == '}' and depth: depth -= 1
        elif src[j] == '`' and not depth: return src[i+1:j], j
        j += 1
    raise ValueError('plantilla sin cerrar')

statements_sql = []
for m in re.finditer(r"\{\s*label:\s*'([^']+)',\s*sql:\s*", reset_src):
    body, _ = sql_template(reset_src, m.end())
    body = body.replace("${inBranch()}", '"sucursalId" IN (\'x\')')
    body = re.sub(r"\$\{inBranch\('(\w+)'\)\}", lambda g: f'"{g.group(1)}" IN (\'x\')', body)
    # Las listas de nombres que el reset arma desde los datos del demo valen
    # como un literal: lo que se verifica son las tablas y las columnas.
    body = re.sub(r'\$\{(?:[^{}]|\{[^{}]*\})*\}', "'x'", body)
    statements_sql.append((m.group(1), body))

def scope_at(sql):
    """Para cada posición del SQL, el ámbito al que pertenece.

    Un `(SELECT` abre uno y su paréntesis lo cierra. Partir el texto por
    `(SELECT` sin cerrar nada dejaba todo lo que viniera después dentro de la
    subconsulta: por eso `articuloResultadoId`, que es columna de Receta y
    está detrás de una subconsulta, se reportaba como inexistente.
    """
    scopes, stack, owner, opens = [set()], [0], [0] * len(sql), []
    for i, c in enumerate(sql):
        if c == '(':
            if sql[i + 1:i + 8].upper() == 'SELECT ':
                scopes.append(set()); stack.append(len(scopes) - 1); opens.append(True)
            else: opens.append(False)
        elif c == ')' and opens:
            if opens.pop() and len(stack) > 1: stack.pop()
        owner[i] = stack[-1]
    return scopes, owner

sql_fails = []
for label, sql in statements_sql:
    if '${' in sql:
        sql_fails.append(f'{label}: interpolación no expandida, revise el verificador'); continue
    target = re.search(r'DELETE FROM "(\w+)"', sql)
    tables = set(re.findall(r'(?:FROM|JOIN)\s+"(\w+)"', sql)) | ({target.group(1)} if target else set())
    for t in sorted(tables):
        if t not in models: sql_fails.append(f'{label}: la tabla {t} no es un modelo')
    scopes, owner = scope_at(sql)
    parents = {}
    if target: scopes[0].add(target.group(1))
    aliases = {}
    for m in re.finditer(r'(?:FROM|JOIN)\s+"(\w+)"(?:\s+(?:AS\s+)?(\w+))?', sql):
        scopes[owner[m.start()]].add(m.group(1))
        if m.group(2) and m.group(2).upper() not in ('ON', 'WHERE'): aliases[m.group(2)] = m.group(1)

    def visible(pos):
        """Las tablas del ámbito y las de los que lo contienen."""
        seen, k = set(), owner[pos]
        seen |= scopes[k]
        return seen | scopes[0]

    for m in re.finditer(r'\b(\w+)\."(\w+)"', sql):
        t = aliases.get(m.group(1))
        if t and m.group(2) not in models.get(t, ()):
            sql_fails.append(f'{label}: {t}.{m.group(2)} no existe (alias {m.group(1)})')
    for m in re.finditer(r'(?<![.\w])"(\w+)"', sql):
        col = m.group(1)
        if col in tables: continue
        here = visible(m.start())
        if not any(col in models.get(t, ()) for t in here):
            sql_fails.append(f'{label}: la columna {col} no existe en {sorted(here)}')
    for m in re.finditer(r'(?:WHERE|AND)\s+(\w+)\s+(?:LIKE|IN|=)', sql):
        here = visible(m.start())
        if not any(m.group(1) in models.get(t, ()) for t in here):
            sql_fails.append(f'{label}: la columna {m.group(1)} no existe en {sorted(here)}')
print(f'{len(statements_sql)} sentencias del reset revisadas')
print('\n'.join(dict.fromkeys(sql_fails)) if sql_fails else 'Todas las columnas del reset existen en su tabla.')
