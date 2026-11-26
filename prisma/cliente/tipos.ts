/**
 * Forma del JSON que produce `prisma/cliente/excel/leer_excel.py` a partir de
 * las plantillas de carga del cliente. Todas las referencias entre secciones
 * son por código (artículo, SKU, grupo) o por nombre exacto (categoría,
 * estación, cuenta); `validar` comprueba que cada una exista antes de abrir
 * una conexión.
 */
export const FORMATO = 'GC-CARGA v1';

export type Dimension = 'MASA' | 'VOLUMEN' | 'UNIDAD';
export type TipoArticulo = 'INGREDIENTE' | 'PREPARACION' | 'PRODUCTO_TERMINADO' | 'EMPAQUE' | 'SUMINISTRO';
export type Modalidad = 'MESA' | 'MOSTRADOR' | 'PARA_LLEVAR' | 'DELIVERY';
export type Rol = 'SUPER_ADMIN' | 'ADMIN_SUCURSAL' | 'CAJERO' | 'MESERO' | 'COCINA' | 'ALMACEN';

export interface Componente {
  articulo: string;
  cantidad: number;
  /** Unidad en que se escribió la cantidad: G, ML, UND, OZ, LB, OZ-FL, CDA… */
  unidad: string;
  merma: number;
  nota?: string;
}

export interface DatosCliente {
  formato: string;
  generado: string;
  origen: { catalogo: string; config: string };

  empresa: { nombreComercial: string; razonSocial: string | null; nit: string | null; colorPrimario: string | null };
  sucursal: {
    nombre: string;
    direccion: string | null;
    telefono: string | null;
    horaCorte: string;
    cobrarAntesDePreparar: boolean;
    pedidosQR: boolean;
  };
  estaciones: { nombre: string }[];
  salas: { nombre: string; orden: number; mesas: { numero: string; capacidad: number }[] }[];
  cajas: { nombre: string }[];
  usuarios: { nombre: string; email: string; correoProvisional: boolean; roles: Rol[] }[];
  cuentas: { nombre: string; tipo: 'BANCO' | 'EFECTIVO_EXTERNO' | 'TARJETA_EMPRESA'; nota: string | null }[];
  rutasPago: { metodo: 'TARJETA' | 'TRANSFERENCIA' | 'OTRO'; cuenta: string }[];
  canales: { codigo: string; nombre: string; activo: boolean; nota: string | null }[];

  unidadesNuevas: string[];
  categorias: { nombre: string; orden: number; estacion: string | null }[];
  articulos: {
    codigo: string;
    nombre: string;
    tipo: TipoArticulo;
    unidad: 'G' | 'ML' | 'UND';
    lote: boolean;
    vencimiento: boolean;
    costo: number;
    stockMinimo: number | null;
    nota?: string;
  }[];
  proveedores: {
    codigo: string;
    nombre: string;
    nit: string | null;
    telefono: string | null;
    correo: string | null;
    direccion: string | null;
    presentaciones: { articulo: string; nombre: string; unidadCompra: string; factor: number; precio: number }[];
  }[];
  recetasProduccion: {
    nombre: string;
    resultado: string;
    /** En la unidad base del artículo resultado. */
    rendimiento: number;
    vidaUtilDias: number | null;
    nota: string | null;
    componentes: Componente[];
  }[];
  productos: {
    codigo: string;
    nombre: string;
    descripcion: string | null;
    tipo: 'PREPARADO' | 'INVENTARIABLE' | 'SERVICIO';
    categoria: string;
    variantes: {
      sku: string;
      nombre: string;
      lista: string;
      precio: number;
      articulo: string | null;
      menus: string[];
      grupos: string[];
      categoria: string;
    }[];
  }[];
  recetasVenta: { sku: string; nombre: string; componentes: Componente[] }[];
  gruposExtras: {
    codigo: string;
    nombre: string;
    minimo: number;
    maximo: number;
    opciones: {
      nombre: string;
      precio: number;
      componente: {
        efecto: 'SUMAR' | 'RESTAR' | 'SUSTITUIR';
        articulo: string;
        cantidad: number;
        unidad: string;
        sustituye: string | null;
      } | null;
    }[];
  }[];
  reglasEmpaque: { nombre: string; sku: string; modalidad: Modalidad; lineas: { articulo: string; cantidad: number }[] }[];
  menus: {
    codigo: string;
    nombre: string;
    horario: { diaSemana: number; desde: string; hasta: string }[];
    secciones: { nombre: string; skus: string[] }[];
  }[];
  existencias: { articulo: string; cantidad: number; costoUnitario: number; lote: string | null; vence: string | null }[];

  resumen: Record<string, number>;
  reporte: { pendientes: string[]; ajustes: string[] };
}

/** Unidades que la carga crea si el catálogo las usa: la semilla inicial no las trae. */
export const UNIDADES_NUEVAS: Record<string, { nombre: string; dimension: Dimension; base: string; factor: number }> = {
  'CDA-CAFE': { nombre: 'Cucharada de café molido', dimension: 'MASA', base: 'G', factor: 7 },
  GAL: { nombre: 'Galón', dimension: 'VOLUMEN', base: 'ML', factor: 3785.411784 },
  'OZ-FL': { nombre: 'Onza líquida', dimension: 'VOLUMEN', base: 'ML', factor: 29.5735295625 },
  CDA: { nombre: 'Cucharada', dimension: 'VOLUMEN', base: 'ML', factor: 15 },
  CDTA: { nombre: 'Cucharadita', dimension: 'VOLUMEN', base: 'ML', factor: 5 },
};

/** Dimensión de cada unidad que puede aparecer en el JSON. */
export const DIMENSION: Record<string, Dimension> = {
  G: 'MASA', KG: 'MASA', LB: 'MASA', OZ: 'MASA', 'CDA-CAFE': 'MASA',
  ML: 'VOLUMEN', L: 'VOLUMEN', GAL: 'VOLUMEN', 'OZ-FL': 'VOLUMEN', CDA: 'VOLUMEN', CDTA: 'VOLUMEN',
  UND: 'UNIDAD',
};

/**
 * Revisa el JSON completo: formato, referencias cruzadas y reglas del sistema
 * que de otro modo fallarían a media carga. Devuelve la lista de problemas.
 */
export function validar(d: DatosCliente): string[] {
  const p: string[] = [];
  if (d.formato !== FORMATO) p.push(`formato «${d.formato}»; se esperaba «${FORMATO}»`);
  const articulos = new Map(d.articulos.map((a) => [a.codigo, a]));
  const skus = new Map(d.productos.flatMap((x) => x.variantes.map((v) => [v.sku, { ...v, tipo: x.tipo }] as const)));
  const categorias = new Set(d.categorias.map((c) => c.nombre));
  const estaciones = new Set(d.estaciones.map((e) => e.nombre));
  const grupos = new Set(d.gruposExtras.map((g) => g.codigo));
  const unidad = (u: string) => (u in DIMENSION ? DIMENSION[u] : null);
  const dimArt = (codigo: string) => DIMENSION[articulos.get(codigo)!.unidad];
  const unico = <T>(lista: T[], k: (x: T) => string, que: string) => {
    const vistos = new Set<string>();
    for (const x of lista) {
      if (vistos.has(k(x))) p.push(`${que} repetido: ${k(x)}`);
      vistos.add(k(x));
    }
  };
  unico(d.articulos, (a) => a.codigo, 'artículo');
  unico(d.productos, (x) => x.codigo, 'producto');
  unico([...skus.keys()], (x) => x, 'SKU');
  unico(d.categorias, (c) => c.nombre, 'categoría');
  unico(d.usuarios, (u) => u.email, 'correo');
  unico(d.salas, (s) => s.nombre, 'sala');
  unico(d.canales, (c) => c.codigo, 'canal');
  for (const s of d.salas) unico(s.mesas, (m) => m.numero, `mesa en ${s.nombre}`);

  const componente = (donde: string, c: { articulo: string; cantidad: number; unidad: string }) => {
    if (!articulos.has(c.articulo)) return void p.push(`${donde}: artículo ${c.articulo} inexistente`);
    if (!(c.cantidad > 0)) p.push(`${donde}: cantidad ${c.cantidad}`);
    if (unidad(c.unidad) !== dimArt(c.articulo))
      p.push(`${donde}: ${c.articulo} se mide en ${articulos.get(c.articulo)!.unidad} y la receta usa ${c.unidad}`);
  };
  for (const u of d.unidadesNuevas) if (!UNIDADES_NUEVAS[u]) p.push(`unidad nueva desconocida: ${u}`);
  for (const c of d.categorias)
    if (c.estacion && !estaciones.has(c.estacion)) p.push(`categoría ${c.nombre}: estación ${c.estacion} inexistente`);
  for (const a of d.articulos) if (a.vencimiento && !a.lote) p.push(`${a.codigo}: vence sin lote`);
  for (const pr of d.proveedores)
    for (const x of pr.presentaciones) {
      if (!articulos.has(x.articulo)) p.push(`compra ${pr.nombre}: artículo ${x.articulo} inexistente`);
      if (!(x.factor > 0) || !unidad(x.unidadCompra)) p.push(`compra ${pr.nombre} / ${x.nombre}: unidad o factor inválido`);
    }
  for (const r of d.recetasProduccion) {
    const a = articulos.get(r.resultado);
    if (!a || !['PREPARACION', 'PRODUCTO_TERMINADO'].includes(a.tipo)) p.push(`preparación ${r.nombre}: resultado inválido`);
    if (!r.componentes.length) p.push(`preparación ${r.nombre}: sin componentes`);
    if (r.componentes.some((c) => c.articulo === r.resultado)) p.push(`preparación ${r.nombre}: se contiene a sí misma`);
    r.componentes.forEach((c) => componente(`preparación ${r.nombre}`, c));
  }
  for (const x of d.productos) {
    if (!categorias.has(x.categoria)) p.push(`producto ${x.nombre}: categoría ${x.categoria} inexistente`);
    for (const v of x.variantes) {
      if (x.tipo === 'INVENTARIABLE' && articulos.get(v.articulo ?? '')?.tipo !== 'PRODUCTO_TERMINADO')
        p.push(`${v.lista}: se vende tal cual y su artículo no es «listo para vender»`);
      if (!(v.precio >= 0)) p.push(`${v.lista}: precio inválido`);
      for (const g of v.grupos) if (!grupos.has(g)) p.push(`${v.lista}: grupo ${g} inexistente`);
    }
  }
  const conReceta = new Set(d.recetasVenta.map((r) => r.sku));
  for (const [sku, v] of skus)
    if (v.tipo === 'PREPARADO' && !conReceta.has(sku)) p.push(`${v.lista}: preparado sin receta (no se podría vender)`);
  for (const r of d.recetasVenta) {
    if (!skus.has(r.sku)) p.push(`receta ${r.nombre}: SKU inexistente`);
    unico(r.componentes, (c) => c.articulo, `componente de ${r.nombre}`);
    r.componentes.forEach((c) => componente(`receta ${r.nombre}`, c));
  }
  for (const g of d.gruposExtras)
    for (const o of g.opciones)
      if (o.componente) {
        componente(`extra ${g.nombre} / ${o.nombre}`, o.componente);
        if (o.componente.sustituye && !articulos.has(o.componente.sustituye))
          p.push(`extra ${o.nombre}: sustituye a un artículo inexistente`);
      }
  unico(d.reglasEmpaque, (r) => `${r.sku}/${r.modalidad}`, 'regla de desechables');
  for (const r of d.reglasEmpaque) {
    if (!skus.has(r.sku)) p.push(`desechables ${r.nombre}: SKU inexistente`);
    for (const l of r.lineas)
      if (articulos.get(l.articulo)?.tipo !== 'EMPAQUE') p.push(`desechables ${r.nombre}: ${l.articulo} no es desechable`);
  }
  for (const m of d.menus) {
    for (const h of m.horario)
      if (!(h.diaSemana >= 0 && h.diaSemana <= 6) || !/^\d{2}:\d{2}$/.test(h.desde) || !/^\d{2}:\d{2}$/.test(h.hasta) || h.desde >= h.hasta)
        p.push(`menú ${m.nombre}: horario inválido`);
    for (const s of m.secciones) for (const sku of s.skus) if (!skus.has(sku)) p.push(`menú ${m.nombre}: SKU ${sku} inexistente`);
  }
  for (const e of d.existencias) {
    const a = articulos.get(e.articulo);
    if (!a) {
      p.push(`existencia: artículo ${e.articulo} inexistente`);
      continue;
    }
    if (a.lote !== !!e.lote) p.push(`existencia ${a.nombre}: ${a.lote ? 'requiere' : 'no admite'} lote`);
    if (a.vencimiento && !e.vence) p.push(`existencia ${a.nombre}: requiere fecha de vencimiento`);
    if (!(e.cantidad > 0) || !(e.costoUnitario >= 0)) p.push(`existencia ${a.nombre}: cantidad o costo inválido`);
  }
  unico(d.existencias, (e) => `${e.articulo}/${e.lote ?? ''}`, 'existencia');
  const cuentas = new Map(d.cuentas.map((c) => [c.nombre, c]));
  for (const r of d.rutasPago) {
    const c = cuentas.get(r.cuenta);
    if (!c) p.push(`forma de pago ${r.metodo}: cuenta ${r.cuenta} inexistente`);
    else if (c.tipo === 'TARJETA_EMPRESA') p.push(`forma de pago ${r.metodo}: no puede ir a una tarjeta de la empresa`);
  }
  if (!d.cajas.length) p.push('no hay ninguna caja');
  if (!d.usuarios.length) p.push('no hay usuarios');
  if (!/^\d{2}:\d{2}$/.test(d.sucursal.horaCorte)) p.push('hora de corte inválida');
  return p;
}
