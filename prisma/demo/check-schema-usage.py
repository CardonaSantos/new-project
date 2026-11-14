#!/usr/bin/env python3
"""
Verifica el uso del esquema sin compilar ni conectarse a la base.

Existe porque la semilla se escribe en un entorno sin node_modules ni
PostgreSQL: sin esto, un campo mal escrito o una clave compuesta inventada
solo aparece cuando la corrida lleva media hora. Contrasta cada escritura de
Prisma contra schema.prisma: que el modelo exista, que el `where` use una
clave realmente unique, que todo campo enviado exista, y que ningun `create`
omita un campo obligatorio sin default.

Uso:  python3 prisma/demo/check-schema-usage.py prisma/demo/masters.ts prisma/seed.ts
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
