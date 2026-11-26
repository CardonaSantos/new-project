#!/usr/bin/env python3
"""
Lee las dos plantillas de carga (catálogo y configuración) y escribe el JSON
que consume `npm run seed:cliente`, junto con un reporte legible.

    python prisma/cliente/excel/leer_excel.py CATALOGO.xlsx CONFIG.xlsx \
        --salida prisma/cliente/datos/rio-azul.json --dominio rioazul.local

Se separa de la carga a propósito: el JSON es el punto de revisión. Lo que la
base recibe es exactamente lo que está en ese archivo, que se puede leer,
comparar con la versión anterior y corregir a mano antes de cargar.

Saneamiento que aplica (nunca cambia un dato del cliente, solo su forma):
  - espacios sobrantes, dobles espacios, textos vacíos -> null;
  - unidades del Excel -> códigos de unidad del sistema;
  - códigos estables generados desde el nombre (artículos, productos, SKU);
  - reglas de desechables por categoría -> una regla por producto y modalidad,
    que es como el sistema las aplica (gana la más específica);
  - lote en existencias de insumos que no controlan lote -> se quita;
  - costo de existencia vacío -> costo de referencia del insumo.
Lo que no puede resolver lo deja en el reporte como «pendiente» o «error».
Con errores no escribe el JSON.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from collections import OrderedDict, defaultdict

import openpyxl

FORMATO = 'GC-CARGA v1'

# Unidad del Excel -> (código, dimensión, factor a la base de su dimensión).
UNIDADES = {
    'g': ('G', 'MASA', 1),
    'kg': ('KG', 'MASA', 1000),
    'lb': ('LB', 'MASA', 453.59237),
    'oz': ('OZ', 'MASA', 28.349523125),
    'cda café': ('CDA-CAFE', 'MASA', 7),
    'ml': ('ML', 'VOLUMEN', 1),
    'l': ('L', 'VOLUMEN', 1000),
    'galón': ('GAL', 'VOLUMEN', 3785.411784),
    'oz líquida': ('OZ-FL', 'VOLUMEN', 29.5735295625),
    'cda': ('CDA', 'VOLUMEN', 15),
    'cdta': ('CDTA', 'VOLUMEN', 5),
    'unidad': ('UND', 'UNIDAD', 1),
}
BASE = {'MASA': 'G', 'VOLUMEN': 'ML', 'UNIDAD': 'UND'}
# Las que la semilla inicial no registra; la carga las crea si se usan.
UNIDADES_NUEVAS = {
    'CDA-CAFE': 'Cucharada de café molido',
    'GAL': 'Galón',
    'OZ-FL': 'Onza líquida',
    'CDA': 'Cucharada',
    'CDTA': 'Cucharadita',
}
TIPO_ARTICULO = {
    'ingrediente': ('INGREDIENTE', 'ING'),
    'preparación': ('PREPARACION', 'PREP'),
    'listo para vender': ('PRODUCTO_TERMINADO', 'PT'),
    'desechable': ('EMPAQUE', 'EMP'),
    'limpieza y otros': ('SUMINISTRO', 'SUM'),
}
TIPO_PRODUCTO = {'con receta': 'PREPARADO', 'se vende tal cual': 'INVENTARIABLE', 'servicio': 'SERVICIO'}
EFECTO = {'agrega': 'SUMAR', 'quita': 'RESTAR', 'cambia por': 'SUSTITUIR', 'sin efecto': None}
TODAS = ['MESA', 'MOSTRADOR', 'PARA_LLEVAR', 'DELIVERY']
CUANDO = {
    'siempre': TODAS,
    'en el local (mesa y mostrador)': ['MESA', 'MOSTRADOR'],
    'en mesa': ['MESA'],
    'mostrador': ['MOSTRADOR'],
    'para llevar y delivery': ['PARA_LLEVAR', 'DELIVERY'],
    'para llevar': ['PARA_LLEVAR'],
    'delivery': ['DELIVERY'],
}
MODALIDAD_TEXTO = {'MESA': 'en mesa', 'MOSTRADOR': 'mostrador', 'PARA_LLEVAR': 'para llevar', 'DELIVERY': 'delivery'}
DIAS = {'domingo': [0], 'lunes': [1], 'martes': [2], 'miércoles': [3], 'jueves': [4], 'viernes': [5], 'sábado': [6],
        'todos los días': [0, 1, 2, 3, 4, 5, 6], 'lunes a viernes': [1, 2, 3, 4, 5], 'sábado y domingo': [6, 0]}
ROLES = {
    'superadministrador': 'SUPER_ADMIN', 'super administrador': 'SUPER_ADMIN',
    'administrador de sucursal': 'ADMIN_SUCURSAL', 'cajero': 'CAJERO', 'mesero': 'MESERO',
    'cocina': 'COCINA', 'almacén': 'ALMACEN',
}
TIPO_CUENTA = {'cuenta bancaria': 'BANCO', 'efectivo fuera de caja': 'EFECTIVO_EXTERNO',
               'tarjeta de la empresa': 'TARJETA_EMPRESA'}
METODO = {'efectivo': 'EFECTIVO', 'tarjeta': 'TARJETA', 'transferencia': 'TRANSFERENCIA', 'otro': 'OTRO'}


class Reporte:
    def __init__(self):
        self.errores: list[str] = []
        self.pendientes: list[str] = []
        self.ajustes: list[str] = []

    def error(self, hoja, fila, msg):
        self.errores.append(f'[{hoja} fila {fila}] {msg}')

    def pendiente(self, msg):
        self.pendientes.append(msg)

    def ajuste(self, msg):
        self.ajustes.append(msg)


def limpio(v):
    """Texto sin espacios sobrantes; vacío -> None. Números y fechas pasan."""
    if v is None:
        return None
    if isinstance(v, str):
        v = re.sub(r'\s+', ' ', v.replace(' ', ' ')).strip()
        return v or None
    return v


def clave(v) -> str:
    """Forma de comparar nombres: sin mayúsculas ni espacios de más."""
    return (limpio(str(v)) or '').lower() if v is not None else ''


def slug(texto: str, largo: int = 48) -> str:
    t = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode()
    t = re.sub(r'[^A-Za-z0-9]+', '-', t).strip('-').upper()
    return t[:largo].rstrip('-')


def numero(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(',', '').strip())
    except ValueError:
        return 'NaN'


def redondeo(x: float, d: int = 6) -> float:
    r = round(x, d)
    return int(r) if r == int(r) else r


def filas(ws, desde=4):
    """(número de fila, valores) de las filas con algún dato, sin la columna Revisión."""
    encabezado = [limpio(c.value) for c in ws[2]]
    for i, fila in enumerate(ws.iter_rows(min_row=desde, values_only=True), start=desde):
        valores = dict()
        for h, v in zip(encabezado, fila):
            if h and h not in ('Revisión',) and not str(h).startswith('_'):
                valores[h] = limpio(v)
        if any(v is not None for v in valores.values()):
            yield i, valores


class Codigos:
    """Códigos únicos y estables: el mismo nombre da el mismo código."""

    def __init__(self):
        self.usados: set[str] = set()

    def nuevo(self, prefijo: str, nombre: str) -> str:
        base = f'{prefijo}-{slug(nombre)}' if prefijo else slug(nombre)
        cod, n = base, 2
        while cod in self.usados:
            cod, n = f'{base}-{n}', n + 1
        self.usados.add(cod)
        return cod


def leer_catalogo(wb, rep: Reporte, menu_siempre: bool = False):
    datos: dict = {}
    unidades_usadas: set[str] = set()

    def unidad(texto, hoja, fila):
        u = UNIDADES.get(clave(texto))
        if not u:
            rep.error(hoja, fila, f'unidad «{texto}» no reconocida')
            return None
        if u[0] in UNIDADES_NUEVAS:
            unidades_usadas.add(u[0])
        return u

    # --- Categorías -------------------------------------------------------
    categorias = []
    por_categoria = {}
    for f, r in filas(wb['Categorías']):
        nombre = r.get('Categoría')
        if not nombre:
            rep.error('Categorías', f, 'falta el nombre')
            continue
        est = r.get('Se prepara en')
        cat = {'nombre': nombre, 'orden': int(numero(r.get('Orden en el menú')) or len(categorias) + 1),
               'estacion': None if clave(est) in ('', 'no se prepara') else est}
        if clave(nombre) in por_categoria:
            rep.error('Categorías', f, f'«{nombre}» está repetida')
            continue
        por_categoria[clave(nombre)] = cat
        categorias.append(cat)
    categorias.sort(key=lambda c: c['orden'])
    datos['categorias'] = categorias

    # --- Inventario ---------------------------------------------------------
    cod_art = Codigos()
    articulos = []
    por_articulo = {}
    for f, r in filas(wb['Inventario']):
        nombre = r.get('Insumo')
        tipo = TIPO_ARTICULO.get(clave(r.get('Tipo')))
        u = UNIDADES.get(clave(r.get('Se controla en')))
        if not nombre or not tipo or not u or u[0] not in ('G', 'ML', 'UND'):
            rep.error('Inventario', f, f'insumo «{nombre}»: falta nombre, tipo o unidad válida (g, ml, unidad)')
            continue
        if clave(nombre) in por_articulo:
            rep.error('Inventario', f, f'«{nombre}» está repetido')
            continue
        vence = clave(r.get('¿Vence?')) == 'sí'
        costo = numero(r.get('Costo por unidad (Q)'))
        if costo == 'NaN':
            costo = None  # «De su receta»: lo calcula la producción.
        minimo = numero(r.get('Stock mínimo'))
        art = {
            'codigo': cod_art.nuevo(tipo[1], nombre), 'nombre': nombre, 'tipo': tipo[0], 'unidad': u[0],
            # Vencimiento exige lote en el sistema: no hay fecha sin lote donde guardarla.
            'lote': vence, 'vencimiento': vence,
            'costo': redondeo(costo) if isinstance(costo, float) else 0,
            'stockMinimo': redondeo(minimo) if isinstance(minimo, float) else None,
        }
        if r.get('Nota'):
            art['nota'] = r['Nota']
        por_articulo[clave(nombre)] = art
        articulos.append(art)
    sin_costo = [a['nombre'] for a in articulos if a['costo'] == 0 and a['tipo'] not in ('PREPARACION', 'PRODUCTO_TERMINADO')]
    if sin_costo:
        rep.pendiente(f'{len(sin_costo)} insumos con costo 0 (se ajusta con la primera compra).')
    datos['articulos'] = articulos

    def articulo(nombre, hoja, fila):
        a = por_articulo.get(clave(nombre))
        if not a:
            rep.error(hoja, fila, f'el insumo «{nombre}» no está en Inventario')
        return a

    def cantidad_en(u_excel, cant, art, hoja, fila, permitir_unidad_propia=True):
        """(cantidad, código de unidad) validando que la dimensión sea la del insumo."""
        u = unidad(u_excel, hoja, fila)
        if not u or not art:
            return None
        dim_art = {'G': 'MASA', 'ML': 'VOLUMEN', 'UND': 'UNIDAD'}[art['unidad']]
        if u[1] != dim_art:
            rep.error(hoja, fila, f'«{art["nombre"]}» se controla en {art["unidad"]} y la fila usa «{u_excel}»')
            return None
        return redondeo(cant), u[0]

    # --- Proveedores y compras ---------------------------------------------
    cod_prov = Codigos()
    proveedores = []
    por_proveedor = {}
    for f, r in filas(wb['Proveedores']):
        nombre = r.get('Proveedor')
        if not nombre:
            continue
        if clave(nombre) in por_proveedor:
            rep.error('Proveedores', f, f'«{nombre}» está repetido')
            continue
        p = {'codigo': cod_prov.nuevo('PROV', nombre), 'nombre': nombre,
             'nit': str(r['NIT']) if r.get('NIT') else None,
             'telefono': str(r['Teléfono']) if r.get('Teléfono') else None,
             'correo': r.get('Correo'), 'direccion': r.get('Dirección'), 'presentaciones': []}
        por_proveedor[clave(nombre)] = p
        proveedores.append(p)
    for f, r in filas(wb['Compras']):
        prov = por_proveedor.get(clave(r.get('Proveedor')))
        art = articulo(r.get('Insumo'), 'Compras', f)
        if not prov:
            rep.error('Compras', f, f'el proveedor «{r.get("Proveedor")}» no está en Proveedores')
            continue
        if not art:
            continue
        cont = numero(r.get('Contenido')) or 1
        u = unidad(r.get('Unidad de compra'), 'Compras', f)
        if not u:
            continue
        dim_art = {'G': 'MASA', 'ML': 'VOLUMEN', 'UND': 'UNIDAD'}[art['unidad']]
        if u[1] != dim_art:
            rep.error('Compras', f, f'«{art["nombre"]}» se controla en {art["unidad"]} y se compra en «{r.get("Unidad de compra")}»')
            continue
        envase = r.get('Envase') or 'Unidad'
        u_txt = r.get('Unidad de compra')
        cont_txt = f'{redondeo(cont):g}' if isinstance(redondeo(cont), float) else str(redondeo(cont))
        if cont == 1:
            # Se compra por unidad de medida: «1 lb = 453.59 g».
            nombre_p = envase if clave(envase) == 'unidad' and u[0] == 'UND' else f'{envase} {cont_txt} {u_txt}'
            unidad_compra, factor = (u[0] if u[0] != 'GAL' else 'UND'), u[2]
        else:
            # Se compra por envase: «1 garrafa = 5 galones = 18 927 ml».
            nombre_p, unidad_compra, factor = f'{envase} {cont_txt} {u_txt}', 'UND', cont * u[2]
        if any(x['nombre'] == nombre_p and x['articulo'] == art['codigo'] for x in prov['presentaciones']):
            rep.ajuste(f'Compras fila {f}: presentación repetida «{nombre_p}» de {prov["nombre"]}, se carga una vez.')
            continue
        prov['presentaciones'].append({'articulo': art['codigo'], 'nombre': nombre_p,
                                       'unidadCompra': unidad_compra, 'factor': redondeo(factor, 10),
                                       'precio': redondeo(numero(r.get('Precio (Q)')) or 0)})
    sin_compra = [p['nombre'] for p in proveedores if not p['presentaciones']]
    if sin_compra:
        rep.pendiente('Proveedores sin compras registradas: ' + ', '.join(sin_compra) + '.')
    por_def = [p for p in proveedores if clave(p['nombre']) == 'por definir']
    if por_def:
        rep.pendiente(f'{len(por_def[0]["presentaciones"])} insumos se compran a «Por definir».')
    datos['proveedores'] = proveedores

    # --- Preparaciones ------------------------------------------------------
    preparaciones = []
    por_preparacion = {}
    for f, r in filas(wb['Preparaciones']):
        art = articulo(r.get('Preparación'), 'Preparaciones', f)
        if not art:
            continue
        if art['tipo'] not in ('PREPARACION', 'PRODUCTO_TERMINADO'):
            rep.error('Preparaciones', f, f'«{art["nombre"]}» es {art["tipo"]} en Inventario; debe ser Preparación o Listo para vender')
            continue
        rinde = numero(r.get('Rinde'))
        conv = cantidad_en(r.get('Unidad') or 'unidad', rinde or 0, art, 'Preparaciones', f)
        if not rinde or rinde == 'NaN' or rinde <= 0 or not conv:
            rep.error('Preparaciones', f, f'«{art["nombre"]}»: rendimiento inválido')
            continue
        u = UNIDADES[clave(r.get('Unidad') or 'unidad')]
        p = {'nombre': art['nombre'], 'resultado': art['codigo'],
             'rendimiento': redondeo(rinde * u[2]),  # en la unidad base del insumo
             'vidaUtilDias': int(numero(r['Dura (días)'])) if r.get('Dura (días)') else None,
             'nota': r.get('Nota'), 'componentes': []}
        por_preparacion[clave(art['nombre'])] = p
        preparaciones.append(p)

    # --- Productos ------------------------------------------------------------
    cod_prod, cod_sku = Codigos(), Codigos()
    productos: 'OrderedDict[str, dict]' = OrderedDict()
    por_lista = {}
    for f, r in filas(wb['Productos']):
        nombre, variante = r.get('Producto'), r.get('Variante')
        cat = por_categoria.get(clave(r.get('Categoría')))
        tipo = TIPO_PRODUCTO.get(clave(r.get('Tipo')))
        if not nombre or not cat or not tipo:
            rep.error('Productos', f, f'«{nombre}»: falta nombre, categoría válida o tipo')
            continue
        lista = r.get('Nombre en listas') or (f'{nombre} – {variante}' if variante else nombre)
        if clave(lista) in por_lista:
            rep.error('Productos', f, f'«{lista}» está repetido')
            continue
        precio = numero(r.get('Precio (Q)'))
        if precio in (None, 'NaN') or precio < 0:
            rep.error('Productos', f, f'«{lista}»: precio inválido')
            continue
        prod = productos.get(clave(nombre))
        if not prod:
            prod = {'codigo': cod_prod.nuevo('', nombre), 'nombre': nombre, 'descripcion': r.get('Descripción'),
                    'tipo': tipo, 'categoria': cat['nombre'], 'variantes': []}
            productos[clave(nombre)] = prod
        else:
            if prod['tipo'] != tipo:
                rep.error('Productos', f, f'«{lista}»: tipo distinto al de las otras variantes de «{nombre}»')
            if prod['categoria'] != cat['nombre']:
                rep.error('Productos', f, f'«{lista}»: categoría distinta a la de las otras variantes de «{nombre}»')
            if r.get('Descripción') and r.get('Descripción') != prod['descripcion']:
                rep.ajuste(f'«{lista}»: el sistema guarda una descripción por producto; se usa la de la primera variante de «{nombre}».')
        art_venta = None
        if tipo == 'INVENTARIABLE':
            a = articulo(r.get('Insumo que se vende'), 'Productos', f)
            if a and a['tipo'] != 'PRODUCTO_TERMINADO':
                rep.error('Productos', f, f'«{lista}»: «{a["nombre"]}» debe ser «Listo para vender» en Inventario')
            art_venta = a['codigo'] if a else None
        menus = [m.strip() for m in (r.get('Menú') or '').split(',') if m.strip()]
        v = {'sku': cod_sku.nuevo('SKU', lista), 'nombre': variante or 'Única', 'lista': lista,
             'precio': redondeo(precio, 2), 'articulo': art_venta, 'menus': menus, 'grupos': [],
             'categoria': cat['nombre']}
        prod['variantes'].append(v)
        por_lista[clave(lista)] = v
    datos['productos'] = list(productos.values())
    for p in datos['productos']:
        if len(p['variantes']) > 1 and any(v['nombre'] == 'Única' for v in p['variantes']):
            rep.error('Productos', '-', f'«{p["nombre"]}» tiene varias filas y alguna sin nombre de variante')

    # --- Recetas --------------------------------------------------------------
    ventas: 'OrderedDict[str, dict]' = OrderedDict()
    for f, r in filas(wb['Recetas']):
        de = r.get('Receta de')
        art = articulo(r.get('Insumo'), 'Recetas', f)
        cant = numero(r.get('Cantidad'))
        if not de or not art:
            continue
        if cant in (None, 'NaN') or cant <= 0:
            rep.error('Recetas', f, f'«{de}» / «{art["nombre"]}»: cantidad inválida')
            continue
        conv = cantidad_en(r.get('Unidad'), cant, art, 'Recetas', f)
        if not conv:
            continue
        merma = numero(r.get('Merma %')) or 0
        comp = {'articulo': art['codigo'], 'cantidad': conv[0], 'unidad': conv[1], 'merma': redondeo(merma)}
        if r.get('Nota'):
            comp['nota'] = r['Nota']
        if clave(de) in por_preparacion:
            destino = por_preparacion[clave(de)]['componentes']
        elif clave(de) in por_lista:
            v = por_lista[clave(de)]
            destino = ventas.setdefault(v['sku'], {'sku': v['sku'], 'nombre': v['lista'], 'componentes': []})['componentes']
        else:
            rep.error('Recetas', f, f'«{de}» no es un producto (Nombre en listas) ni una preparación')
            continue
        previo = next((c for c in destino if c['articulo'] == comp['articulo']), None)
        if previo:
            if previo['unidad'] != comp['unidad']:
                rep.error('Recetas', f, f'«{de}» lleva «{art["nombre"]}» dos veces en unidades distintas')
                continue
            previo['cantidad'] = redondeo(previo['cantidad'] + comp['cantidad'])
            rep.ajuste(f'Recetas fila {f}: «{de}» lleva «{art["nombre"]}» en dos filas; se suman.')
            continue
        destino.append(comp)
    for p in preparaciones:
        if not p['componentes']:
            rep.error('Preparaciones', '-', f'«{p["nombre"]}» no tiene receta')
    datos['recetasProduccion'] = preparaciones
    for prod in datos['productos']:
        for v in prod['variantes']:
            if prod['tipo'] == 'PREPARADO' and v['sku'] not in ventas:
                rep.error('Recetas', '-', f'«{v["lista"]}» es «Con receta» y no tiene receta')
            if prod['tipo'] == 'INVENTARIABLE' and v['sku'] in ventas:
                rep.ajuste(f'«{v["lista"]}» se vende tal cual; su receta se ignora.')
                del ventas[v['sku']]
    datos['recetasVenta'] = list(ventas.values())

    # --- Extras ---------------------------------------------------------------
    cod_grp = Codigos()
    grupos = OrderedDict()
    for f, r in filas(wb['Extras']):
        nombre = r.get('Grupo')
        if not nombre:
            continue
        maximo = int(numero(r.get('Máximo a elegir')) or 1)
        grupos[clave(nombre)] = {'codigo': cod_grp.nuevo('MOD', nombre), 'nombre': nombre,
                                 'minimo': 0, 'maximo': maximo, 'opciones': []}
    for f, r in filas(wb['Opciones de extras']):
        g = grupos.get(clave(r.get('Grupo')))
        if not g:
            rep.error('Opciones de extras', f, f'el grupo «{r.get("Grupo")}» no está en Extras')
            continue
        efecto = clave(r.get('Efecto') or 'sin efecto')
        if efecto not in EFECTO:
            rep.error('Opciones de extras', f, f'efecto «{r.get("Efecto")}» no reconocido')
            continue
        op = {'nombre': r.get('Opción'), 'precio': redondeo(numero(r.get('Precio extra (Q)')) or 0, 2), 'componente': None}
        if EFECTO[efecto]:
            art = articulo(r.get('Insumo'), 'Opciones de extras', f)
            cant = numero(r.get('Cantidad'))
            conv = cantidad_en(r.get('Unidad'), cant or 0, art, 'Opciones de extras', f) if art else None
            if not conv or not cant:
                continue
            sust = None
            if EFECTO[efecto] == 'SUSTITUIR':
                s = articulo(r.get('En lugar de'), 'Opciones de extras', f)
                sust = s['codigo'] if s else None
            op['componente'] = {'efecto': EFECTO[efecto], 'articulo': art['codigo'], 'cantidad': conv[0],
                                'unidad': conv[1], 'sustituye': sust}
        g['opciones'].append(op)
    for f, r in filas(wb['Extras por producto']):
        v = por_lista.get(clave(r.get('Producto')))
        g = grupos.get(clave(r.get('Grupo de extras')))
        if not v or not g:
            rep.error('Extras por producto', f, f'«{r.get("Producto")}» o «{r.get("Grupo de extras")}» no existe')
            continue
        obligatorio = clave(r.get('¿Obligatorio?')) == 'sí'
        if obligatorio:
            g['minimo'] = 1  # el sistema marca obligatorio el grupo que exige una elección
        v['grupos'].append(g['codigo'])
    datos['gruposExtras'] = list(grupos.values())

    # --- Desechables ------------------------------------------------------------
    # El sistema aplica, por producto y modalidad, UNA regla: la más específica.
    # Por eso las filas por categoría se combinan con las del producto en una
    # sola regla por variante y modalidad.
    lineas = defaultdict(lambda: OrderedDict())  # (sku, modalidad) -> articulo -> (cantidad, origen)
    for f, r in filas(wb['Desechables']):
        destino = r.get('Aplica a')
        art = articulo(r.get('Insumo'), 'Desechables', f)
        cant = numero(r.get('Cantidad'))
        mods = CUANDO.get(clave(r.get('Cuándo')))
        if not art or not mods or cant in (None, 'NaN') or cant <= 0:
            if art:
                rep.error('Desechables', f, 'falta «Cuándo» o la cantidad')
            continue
        if art['tipo'] != 'EMPAQUE':
            rep.error('Desechables', f, f'«{art["nombre"]}» debe ser «Desechable» en Inventario')
            continue
        if clave(destino) in por_categoria:
            variantes = [v for p in datos['productos'] for v in p['variantes'] if clave(v['categoria']) == clave(destino)]
            origen = 'categoria'
        elif clave(destino) in por_lista:
            variantes, origen = [por_lista[clave(destino)]], 'producto'
        else:
            rep.error('Desechables', f, f'«{destino}» no es una categoría ni un producto')
            continue
        for v in variantes:
            for m in mods:
                actual = lineas[(v['sku'], m)].get(art['codigo'])
                if actual and actual[1] == 'producto' and origen == 'categoria':
                    continue  # lo del producto manda sobre lo de su categoría
                if actual and actual[1] == origen:
                    cant_final = actual[0] + cant
                else:
                    cant_final = cant
                lineas[(v['sku'], m)][art['codigo']] = (cant_final, origen)
    reglas = []
    lista_de = {v['sku']: v['lista'] for v in por_lista.values()}
    for (sku, m), arts in lineas.items():
        reglas.append({'nombre': f'{lista_de[sku]} · {MODALIDAD_TEXTO[m]}', 'sku': sku, 'modalidad': m,
                       'lineas': [{'articulo': a, 'cantidad': redondeo(c)} for a, (c, _) in arts.items()]})
    datos['reglasEmpaque'] = reglas

    # --- Menús -------------------------------------------------------------------
    menus = OrderedDict()
    cod_menu = Codigos()
    for f, r in filas(wb['Menús']):
        nombre = r.get('Menú')
        if not nombre:
            continue
        m = menus.setdefault(clave(nombre), {'codigo': cod_menu.nuevo('MENU', nombre), 'nombre': nombre,
                                             'horario': [], 'secciones': []})
        dias = DIAS.get(clave(r.get('Días')))
        desde, hasta = hora(r.get('Desde')), hora(r.get('Hasta'))
        if r.get('Días') and not dias:
            rep.error('Menús', f, f'días «{r.get("Días")}» no reconocidos')
            continue
        if dias and desde and hasta:
            for d in dias:
                m['horario'].append({'diaSemana': d, 'desde': desde, 'hasta': hasta})
    for p in datos['productos']:
        for v in p['variantes']:
            for nombre in v['menus']:
                if clave(nombre) not in menus:
                    rep.error('Productos', '-', f'«{v["lista"]}» usa el menú «{nombre}», que no está en Menús')
    for m in menus.values():
        for cat in categorias:
            skus = [v['sku'] for p in datos['productos'] for v in p['variantes']
                    if clave(v['categoria']) == clave(cat['nombre']) and any(clave(x) == clave(m['nombre']) for x in v['menus'])]
            if skus:
                m['secciones'].append({'nombre': cat['nombre'], 'skus': skus})
        if m['horario'] and menu_siempre:
            rep.ajuste(f'El menú «{m["nombre"]}» se carga sin horario para que esté visible siempre '
                       '(el Excel traía un horario; se puede poner en Menús cuando se quiera).')
            m['horario'] = []
        if m['horario']:
            rangos = sorted({(h['desde'], h['hasta']) for h in m['horario']})
            dias_txt = len({h['diaSemana'] for h in m['horario']})
            rep.pendiente(f'El menú «{m["nombre"]}» solo aparece en el POS {dias_txt} días, de '
                          + ', '.join(f'{a} a {b}' for a, b in rangos)
                          + '. Fuera de ese horario el POS no muestra productos.')
    sin_menu = [v['lista'] for v in por_lista.values() if not v['menus']]
    if sin_menu:
        rep.pendiente('Productos sin menú (no se verán en el POS): ' + ', '.join(sin_menu) + '.')
    datos['menus'] = list(menus.values())

    # --- Existencia inicial --------------------------------------------------------
    existencias = []
    lote_quitado = 0
    for f, r in filas(wb['Existencia inicial']):
        art = articulo(r.get('Insumo'), 'Existencia inicial', f)
        cant = numero(r.get('Cantidad'))
        if not art:
            continue
        if cant in (None, 'NaN') or cant <= 0:
            rep.error('Existencia inicial', f, f'«{art["nombre"]}»: cantidad inválida')
            continue
        conv = cantidad_en(r.get('Unidad') or 'unidad', cant, art, 'Existencia inicial', f)
        if not conv:
            continue
        base = redondeo(conv[0] * UNIDADES[clave(r.get('Unidad') or 'unidad')][2])
        costo = numero(r.get('Costo unitario (Q)'))
        if costo in (None, 'NaN'):
            costo = art['costo']
        vence = r.get('Vence el')
        if isinstance(vence, (dt.datetime, dt.date)):
            vence = vence.strftime('%Y-%m-%d')
        lote = r.get('Lote')
        if art['lote']:
            lote = str(lote or 'INICIAL').upper()
            if art['vencimiento'] and not vence:
                rep.error('Existencia inicial', f, f'«{art["nombre"]}» vence y no tiene fecha')
                continue
        else:
            if lote:
                lote_quitado += 1
            lote, vence = None, None
        if any(e['articulo'] == art['codigo'] and e['lote'] == lote for e in existencias):
            rep.error('Existencia inicial', f, f'«{art["nombre"]}» aparece dos veces con el mismo lote')
            continue
        existencias.append({'articulo': art['codigo'], 'cantidad': base, 'costoUnitario': redondeo(costo),
                            'lote': lote, 'vence': vence})
    if lote_quitado:
        rep.ajuste(f'{lote_quitado} existencias traían lote «INICIAL» en insumos que no vencen; el sistema '
                   'solo guarda lote en los que vencen, así que se cargan sin lote.')
    fechas = defaultdict(int)
    for e in existencias:
        if e['vence']:
            fechas[e['vence']] += 1
    for fecha, n in sorted(fechas.items()):
        rep.pendiente(f'{n} existencias vencen el {fecha} (fecha de relleno): ajustarlas con el conteo real.')
    datos['existencias'] = existencias
    datos['unidadesNuevas'] = sorted(unidades_usadas)
    return datos


def hora(v):
    if v is None:
        return None
    if isinstance(v, dt.time):
        return v.strftime('%H:%M')
    if isinstance(v, dt.datetime):
        return v.strftime('%H:%M')
    if isinstance(v, float):  # fracción de día de Excel
        m = round(v * 24 * 60)
        return f'{m // 60:02d}:{m % 60:02d}'
    t = str(v).strip()
    if re.fullmatch(r'\d{1,2}:\d{2}', t):
        h, m = t.split(':')
        return f'{int(h):02d}:{m}'
    return None


def correo_provisional(nombre: str, dominio: str, usados: set) -> str:
    partes = [slug(p, 30).lower() for p in nombre.split() if p]
    base = '.'.join(partes[:2]) if len(partes) > 1 else partes[0]
    cand, n = f'{base}@{dominio}', 2
    while cand in usados:
        cand, n = f'{base}{n}@{dominio}', n + 1
    return cand


def leer_config(wb, rep: Reporte, catalogo: dict, dominio: str):
    datos: dict = {}
    neg = {}
    ws = wb['Negocio y sucursal']
    for fila in ws.iter_rows(min_row=4, values_only=True):
        etiqueta, valor = limpio(fila[1]), limpio(fila[2])
        if etiqueta:
            neg[clave(etiqueta).rstrip(' *')] = valor

    def dato(nombre, obligatorio=False):
        v = neg.get(nombre)
        if obligatorio and not v:
            rep.error('Negocio y sucursal', '-', f'falta «{nombre}»')
        return v

    color = dato('color de marca')
    if color and not re.fullmatch(r'#[0-9A-Fa-f]{6}', str(color)):
        rep.ajuste(f'El color «{color}» no es un código válido; se deja el del sistema.')
        color = None
    datos['empresa'] = {'nombreComercial': dato('nombre comercial', True), 'razonSocial': dato('razón social'),
                        'nit': str(dato('nit')) if dato('nit') else None,
                        'colorPrimario': color.upper() if color else None}
    corte = hora(dato('hora de corte del día', True)) or '04:00'
    datos['sucursal'] = {
        'nombre': dato('nombre de la sucursal', True), 'direccion': dato('dirección'),
        'telefono': str(dato('teléfono')) if dato('teléfono') else None, 'horaCorte': corte,
        'cobrarAntesDePreparar': clave(dato('¿cobrar antes de preparar?')) == 'sí',
        'pedidosQR': clave(dato('¿acepta pedidos por qr desde la mesa?')) == 'sí',
    }

    usadas = {clave(c['estacion']) for c in catalogo['categorias'] if c['estacion']}
    estaciones = []
    for f, r in filas(wb['Estaciones']):
        nombre = r.get('Estación')
        if not nombre:
            continue
        if clave(nombre) not in usadas:
            rep.ajuste(f'La estación «{nombre}» no prepara ninguna categoría ({r.get("Nota") or "sin nota"}); '
                       'no se crea como estación de preparación.')
            continue
        estaciones.append({'nombre': nombre})
    for e in usadas:
        if e not in {clave(x['nombre']) for x in estaciones}:
            rep.error('Categorías', '-', f'la estación «{e}» no está en la hoja Estaciones')
    datos['estaciones'] = estaciones

    salas = OrderedDict()
    for f, r in filas(wb['Salas']):
        if r.get('Sala'):
            salas[clave(r['Sala'])] = {'nombre': r['Sala'], 'orden': int(numero(r.get('Orden')) or len(salas) + 1),
                                       'mesas': []}
    for f, r in filas(wb['Mesas']):
        sala = salas.get(clave(r.get('Sala')))
        mesa = r.get('Mesa')
        if mesa is None:
            continue
        if not sala:
            rep.error('Mesas', f, f'la sala «{r.get("Sala")}» no está en Salas')
            continue
        pers = int(numero(r.get('Personas por mesa')) or 0)
        if pers <= 0:
            rep.error('Mesas', f, f'mesa «{mesa}»: faltan las personas')
            continue
        hasta = numero(r.get('Hasta'))
        nums = []
        if isinstance(mesa, (int, float)) and isinstance(hasta, float) and hasta >= mesa:
            nums = [str(int(n)) for n in range(int(mesa), int(hasta) + 1)]
        else:
            nums = [str(int(mesa)) if isinstance(mesa, float) and mesa == int(mesa) else str(mesa)]
        for n in nums:
            if any(m['numero'] == n for m in sala['mesas']):
                rep.error('Mesas', f, f'la mesa «{n}» de {sala["nombre"]} está repetida')
                continue
            sala['mesas'].append({'numero': n, 'capacidad': pers})
    datos['salas'] = sorted(salas.values(), key=lambda s: s['orden'])
    for s in datos['salas']:
        if not s['mesas']:
            rep.pendiente(f'La sala «{s["nombre"]}» no tiene mesas.')

    datos['cajas'] = [{'nombre': r['Caja']} for f, r in filas(wb['Cajas']) if r.get('Caja')]

    usuarios, correos = [], set()
    for f, r in filas(wb['Usuarios']):
        nombre = r.get('Nombre')
        if not nombre:
            continue
        roles = []
        for col in ('Rol', 'Segundo rol'):
            if r.get(col):
                cod = ROLES.get(clave(r[col]))
                if not cod:
                    rep.error('Usuarios', f, f'rol «{r[col]}» no reconocido')
                elif cod not in roles:
                    roles.append(cod)
        if not roles:
            rep.error('Usuarios', f, f'«{nombre}» no tiene rol')
            continue
        correo = (r.get('Correo') or '').lower() or None
        provisional = False
        if correo and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', correo):
            rep.error('Usuarios', f, f'el correo «{correo}» no es válido')
            continue
        if not correo:
            correo, provisional = correo_provisional(nombre, dominio, correos), True
        if correo in correos:
            rep.error('Usuarios', f, f'el correo de «{nombre}» está repetido')
            continue
        correos.add(correo)
        usuarios.append({'nombre': nombre, 'email': correo, 'correoProvisional': provisional, 'roles': roles})
    datos['usuarios'] = usuarios
    prov = [u for u in usuarios if u['correoProvisional']]
    if prov:
        rep.pendiente(f'{len(prov)} usuarios sin correo entran con uno provisional: '
                      + ', '.join(f'{u["nombre"]} ({u["email"]})' for u in prov)
                      + '. Se puede cambiar después en Usuarios.')
    if 'SUPER_ADMIN' in {r for u in usuarios for r in u['roles']}:
        rep.ajuste('«Superadministrador» no está en la lista de roles; se asigna el rol de administración general.')
    if not any(r in ('CAJERO', 'ADMIN_SUCURSAL', 'SUPER_ADMIN') for u in usuarios for r in u['roles']):
        rep.pendiente('Nadie tiene rol para cobrar.')
    elif not any('CAJERO' in u['roles'] for u in usuarios):
        rep.pendiente('Nadie tiene el rol Cajero: cobran los administradores.')

    cuentas = []
    for f, r in filas(wb['Cuentas']):
        if not r.get('Cuenta'):
            continue
        tipo = TIPO_CUENTA.get(clave(r.get('Tipo')))
        if not tipo:
            rep.error('Cuentas', f, f'tipo «{r.get("Tipo")}» no reconocido')
            continue
        cuentas.append({'nombre': r['Cuenta'], 'tipo': tipo, 'nota': r.get('Nota')})
    datos['cuentas'] = cuentas
    rutas = []
    for f, r in filas(wb['Formas de pago']):
        metodo = METODO.get(clave(r.get('Forma de pago')))
        if not metodo or clave(r.get('¿La acepta?')) != 'sí' or metodo == 'EFECTIVO':
            continue  # el efectivo queda en la caja del turno: no se enruta
        cuenta = next((c for c in cuentas if clave(c['nombre']) == clave(r.get('Se deposita en'))), None)
        if not cuenta:
            rep.pendiente(f'{r.get("Forma de pago")}: se acepta pero no dice a qué cuenta va.')
            continue
        if cuenta['tipo'] == 'TARJETA_EMPRESA':
            rep.error('Formas de pago', f, 'un cobro no puede ir a una tarjeta de la empresa')
            continue
        rutas.append({'metodo': metodo, 'cuenta': cuenta['nombre']})
    datos['rutasPago'] = rutas

    cod = Codigos()
    datos['canales'] = [{'codigo': cod.nuevo('', r['Plataforma']), 'nombre': r['Plataforma'],
                         'activo': clave(r.get('¿Activa?')) != 'no', 'nota': r.get('Nota')}
                        for f, r in filas(wb['Delivery']) if r.get('Plataforma')]
    gastos = [r['Categoría'] for f, r in filas(wb['Categorías de gasto']) if r.get('Categoría')]
    if gastos:
        rep.pendiente(f'{len(gastos)} categorías de gasto quedan fuera: el sistema todavía no tiene dónde '
                      'guardarlas (' + ', '.join(gastos) + ').')
    return datos


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('catalogo')
    ap.add_argument('config')
    ap.add_argument('--salida', required=True)
    ap.add_argument('--menu-siempre-visible', action='store_true',
                    help='carga los menús sin horario: visibles a toda hora')
    ap.add_argument('--dominio', default='sin-correo.local', help='dominio de los correos provisionales')
    a = ap.parse_args()

    rep = Reporte()
    cat_wb = openpyxl.load_workbook(a.catalogo, data_only=True)
    cfg_wb = openpyxl.load_workbook(a.config, data_only=True)
    catalogo = leer_catalogo(cat_wb, rep, a.menu_siempre_visible)
    config = leer_config(cfg_wb, rep, catalogo, a.dominio)

    salida = {'formato': FORMATO, 'generado': dt.date.today().isoformat(),
              'origen': {'catalogo': a.catalogo.split('/')[-1], 'config': a.config.split('/')[-1]},
              **config, **catalogo}
    resumen = {
        'categorias': len(catalogo['categorias']), 'insumos': len(catalogo['articulos']),
        'proveedores': len(catalogo['proveedores']),
        'presentaciones': sum(len(p['presentaciones']) for p in catalogo['proveedores']),
        'preparaciones': len(catalogo['recetasProduccion']), 'productos': len(catalogo['productos']),
        'variantes': sum(len(p['variantes']) for p in catalogo['productos']),
        'recetasVenta': len(catalogo['recetasVenta']), 'gruposExtras': len(catalogo['gruposExtras']),
        'reglasDesechables': len(catalogo['reglasEmpaque']), 'menus': len(catalogo['menus']),
        'existencias': len(catalogo['existencias']), 'estaciones': len(config['estaciones']),
        'salas': len(config['salas']), 'mesas': sum(len(s['mesas']) for s in config['salas']),
        'cajas': len(config['cajas']), 'usuarios': len(config['usuarios']), 'cuentas': len(config['cuentas']),
        'canales': len(config['canales']),
    }
    salida['resumen'] = resumen
    salida['reporte'] = {'pendientes': rep.pendientes, 'ajustes': rep.ajustes}

    print('Resumen:', ', '.join(f'{k} {v}' for k, v in resumen.items()))
    for titulo, lista in (('Ajustes hechos', rep.ajustes), ('Pendientes del cliente', rep.pendientes),
                          ('ERRORES', rep.errores)):
        if lista:
            print(f'\n{titulo} ({len(lista)}):')
            for x in lista:
                print('  -', x)
    if rep.errores:
        print('\nHay errores: no se escribió el JSON.')
        sys.exit(1)
    with open(a.salida, 'w', encoding='utf-8') as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'\nEscrito {a.salida}')


if __name__ == '__main__':
    main()
