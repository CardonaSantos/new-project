/**
 * Escribe los maestros del cliente (configuración y catálogo) a partir del
 * JSON revisado. Corre dentro de una sola transacción: o entra todo, o no
 * entra nada y la base queda como la dejó la semilla inicial.
 *
 * Adaptado de prisma/demo/masters.ts, con dos diferencias deliberadas:
 *  - los datos vienen del JSON del cliente, no de constantes del demo;
 *  - lo que la semilla inicial ya creó (sucursal PRINCIPAL, «Sala principal»,
 *    CAJA-1, estación «Cocina», almacén y ubicación) se reutiliza y se renombra
 *    con los nombres del cliente, en vez de dejar duplicados vacíos.
 */
import type { Prisma } from '../../src/generated/prisma/client.js';
import { UNIDADES_NUEVAS, type DatosCliente } from './tipos.js';

type Db = Prisma.TransactionClient;

export interface IdsCarga {
  sucursalId: string;
  ubicacionId: string;
  unidades: Map<string, string>;
  articulos: Map<string, string>;
  productos: Map<string, string>;
  variantes: Map<string, string>;
  mesas: string[];
  usuarios: Map<string, string>;
}

export type Avance = (msg: string) => void;

/** Número a texto decimal sin exponente, como lo esperan los servicios. */
export function decimal(n: number, posiciones = 6): string {
  const s = n.toFixed(posiciones);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

export async function escribirMaestros(
  db: Db,
  d: DatosCliente,
  hashContrasena: string,
  avance: Avance,
): Promise<IdsCarga> {
  const ahora = new Date();

  // --- Unidades -------------------------------------------------------------
  const unidades = new Map<string, string>((await db.unidadMedida.findMany({ select: { id: true, codigo: true } })).map((u: { id: string; codigo: string }) => [u.codigo, u.id] as const));
  for (const necesaria of ['UND', 'G', 'ML', 'KG', 'LB', 'OZ', 'L'])
    if (!unidades.has(necesaria)) throw Error(`Falta la unidad ${necesaria}: ejecute primero "npm run seed:initial".`);
  for (const codigo of d.unidadesNuevas) {
    const u = UNIDADES_NUEVAS[codigo];
    const row = await db.unidadMedida.upsert({
      where: { codigo },
      update: { nombre: u.nombre, dimension: u.dimension },
      create: { codigo, nombre: u.nombre, dimension: u.dimension, esBase: false },
    });
    unidades.set(codigo, row.id);
    const base = unidades.get(u.base)!;
    await db.conversionUnidad.upsert({
      where: { unidadOrigenId_unidadDestinoId: { unidadOrigenId: row.id, unidadDestinoId: base } },
      update: { factor: u.factor },
      create: { unidadOrigenId: row.id, unidadDestinoId: base, factor: u.factor },
    });
  }
  const unidad = (codigo: string) => {
    const id = unidades.get(codigo);
    if (!id) throw Error(`Unidad ${codigo} inexistente en la base`);
    return id;
  };

  // --- Empresa y sucursal -----------------------------------------------------
  const empresa = await db.empresaConfiguracion.findFirst();
  if (!empresa) throw Error('No hay configuración de empresa: ejecute primero "npm run seed:initial".');
  await db.empresaConfiguracion.update({
    where: { id: empresa.id },
    data: {
      nombreComercial: d.empresa.nombreComercial,
      razonSocial: d.empresa.razonSocial,
      nit: d.empresa.nit,
      ...(d.empresa.colorPrimario ? { colorPrimario: d.empresa.colorPrimario } : {}),
    },
  });

  const sucursal = await db.sucursal.findUnique({ where: { codigo: 'PRINCIPAL' } });
  if (!sucursal) throw Error('No existe la sucursal PRINCIPAL: ejecute primero "npm run seed:initial".');
  await db.sucursal.update({
    where: { id: sucursal.id },
    data: { nombre: d.sucursal.nombre, direccion: d.sucursal.direccion, telefono: d.sucursal.telefono, activa: true },
  });
  const config = {
    horaCorteOperativo: d.sucursal.horaCorte,
    exigeCobroAntesPreparar: d.sucursal.cobrarAntesDePreparar,
    permiteOrdenesQR: d.sucursal.pedidosQR,
    moneda: 'GTQ',
  };
  await db.configuracionSucursal.upsert({
    where: { sucursalId: sucursal.id },
    update: config,
    create: { sucursalId: sucursal.id, ...config },
  });
  const almacen = await db.almacen.findFirst({ where: { sucursalId: sucursal.id, codigo: 'PRINCIPAL' } });
  const ubicacion = almacen
    ? await db.ubicacionAlmacen.findFirst({ where: { almacenId: almacen.id, codigo: 'GENERAL' } })
    : null;
  if (!ubicacion) throw Error('Falta el almacén PRINCIPAL / ubicación GENERAL de la semilla inicial.');

  // --- Estaciones -----------------------------------------------------------------
  const estaciones = new Map<string, string>();
  for (const e of d.estaciones) {
    const row = await db.estacionPreparacion.upsert({
      where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: e.nombre } },
      update: { activa: true, ubicacionConsumoId: ubicacion.id },
      create: { sucursalId: sucursal.id, nombre: e.nombre, ubicacionConsumoId: ubicacion.id },
    });
    estaciones.set(e.nombre, row.id);
  }
  // La «Cocina» de la semilla, si el cliente no la usa, queda inactiva: una
  // estación activa sin rutas recibiría lo que no tenga a dónde ir.
  await db.estacionPreparacion.updateMany({
    where: { sucursalId: sucursal.id, id: { notIn: [...estaciones.values()] } },
    data: { activa: false },
  });

  // --- Salas y mesas -----------------------------------------------------------------
  const mesas: string[] = [];
  for (const [indice, s] of d.salas.entries()) {
    let sala = await db.sala.findUnique({ where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: s.nombre } } });
    if (!sala && indice === 0) {
      const porDefecto = await db.sala.findUnique({
        where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: 'Sala principal' } },
      });
      if (porDefecto && !(await db.mesa.count({ where: { salaId: porDefecto.id } })))
        sala = await db.sala.update({ where: { id: porDefecto.id }, data: { nombre: s.nombre } });
    }
    sala = sala
      ? await db.sala.update({ where: { id: sala.id }, data: { orden: indice, activa: true } })
      : await db.sala.create({ data: { sucursalId: sucursal.id, nombre: s.nombre, orden: indice } });
    for (const m of s.mesas) {
      const row = await db.mesa.upsert({
        where: { salaId_numero: { salaId: sala.id, numero: m.numero } },
        update: { capacidad: m.capacidad, activa: true },
        create: { salaId: sala.id, numero: m.numero, capacidad: m.capacidad },
      });
      mesas.push(row.id);
    }
  }
  const salaSobrante = await db.sala.findUnique({
    where: { sucursalId_nombre: { sucursalId: sucursal.id, nombre: 'Sala principal' } },
  });
  if (salaSobrante && !d.salas.some((s) => s.nombre === 'Sala principal'))
    await db.sala.update({ where: { id: salaSobrante.id }, data: { activa: false } });

  // --- Cajas ------------------------------------------------------------------------
  for (const [indice, c] of d.cajas.entries()) {
    const codigo = `CAJA-${indice + 1}`;
    await db.caja.upsert({
      where: { sucursalId_codigo: { sucursalId: sucursal.id, codigo } },
      update: { nombre: c.nombre, activa: true },
      create: { sucursalId: sucursal.id, codigo, nombre: c.nombre },
    });
  }
  avance(`sucursal «${d.sucursal.nombre}»: ${estaciones.size} estaciones, ${d.salas.length} salas, ${mesas.length} mesas, ${d.cajas.length} cajas`);

  // --- Categorías y rutas de preparación ---------------------------------------------------
  const categorias = new Map<string, string>();
  for (const [indice, c] of d.categorias.entries()) {
    const encontrada = await db.categoria.findFirst({ where: { nombre: c.nombre, parentId: null } });
    const row = encontrada
      ? await db.categoria.update({ where: { id: encontrada.id }, data: { orden: indice, activa: true } })
      : await db.categoria.create({ data: { nombre: c.nombre, orden: indice } });
    categorias.set(c.nombre, row.id);
    if (c.estacion)
      await db.rutaPreparacion.create({
        data: { estacionId: estaciones.get(c.estacion)!, categoriaId: row.id, prioridad: 0 },
      });
  }

  // --- Artículos ------------------------------------------------------------------------
  const articulos = new Map<string, string>();
  for (const a of d.articulos) {
    const row = await db.articuloInventario.create({
      data: {
        codigo: a.codigo,
        nombre: a.nombre,
        tipo: a.tipo,
        unidadBaseId: unidad(a.unidad),
        requiereLote: a.lote,
        requiereVencimiento: a.vencimiento,
        costoReferencia: a.costo,
        stockMinimo: a.stockMinimo,
      },
    });
    articulos.set(a.codigo, row.id);
  }
  const articulo = (codigo: string) => articulos.get(codigo)!;
  avance(`${d.categorias.length} categorías, ${articulos.size} insumos`);

  // --- Proveedores y presentaciones ----------------------------------------------------------
  let presentaciones = 0;
  for (const p of d.proveedores) {
    const row = await db.proveedor.create({
      data: { nombre: p.nombre, nit: p.nit, telefono: p.telefono, email: p.correo, direccion: p.direccion },
    });
    for (const x of p.presentaciones) {
      await db.presentacionCompra.create({
        data: {
          articuloId: articulo(x.articulo),
          proveedorId: row.id,
          nombre: x.nombre,
          unidadCompraId: unidad(x.unidadCompra),
          factorAUnidadBase: x.factor,
        },
      });
      presentaciones++;
    }
  }
  avance(`${d.proveedores.length} proveedores, ${presentaciones} presentaciones de compra`);

  // --- Recetas (versión 1, publicada: sin receta publicada no se puede vender) ----------
  const escribirVersion = async (
    recetaId: string,
    componentes: DatosCliente['recetasVenta'][number]['componentes'],
    rendimiento: number,
    unidadRendimiento: string,
    vidaUtilDias: number | null,
  ) => {
    const version = await db.recetaVersion.create({
      data: {
        recetaId,
        numero: 1,
        rendimiento,
        unidadRendimientoId: unidad(unidadRendimiento),
        publicadaEn: ahora,
        activa: true,
        vidaUtilDias,
      },
    });
    await db.recetaComponente.createMany({
      data: componentes.map((c) => ({
        recetaVersionId: version.id,
        articuloId: articulo(c.articulo),
        cantidad: c.cantidad,
        unidadId: unidad(c.unidad),
        mermaPorcentaje: c.merma,
      })),
    });
  };
  const porCodigo = new Map(d.articulos.map((a) => [a.codigo, a]));
  for (const r of d.recetasProduccion) {
    const receta = await db.receta.create({
      data: { nombre: r.nombre, tipo: 'PRODUCCION', articuloResultadoId: articulo(r.resultado) },
    });
    await escribirVersion(receta.id, r.componentes, r.rendimiento, porCodigo.get(r.resultado)!.unidad, r.vidaUtilDias);
  }

  // --- Extras ------------------------------------------------------------------------------
  const grupos = new Map<string, { id: string; minimo: number }>();
  for (const g of d.gruposExtras) {
    const grupo = await db.grupoModificador.create({ data: { nombre: g.nombre, minimo: g.minimo, maximo: g.maximo } });
    grupos.set(g.codigo, { id: grupo.id, minimo: g.minimo });
    for (const o of g.opciones) {
      const opcion = await db.modificador.create({
        data: { grupoId: grupo.id, nombre: o.nombre, incrementoPrecio: o.precio },
      });
      if (o.componente)
        await db.modificadorComponente.create({
          data: {
            modificadorId: opcion.id,
            articuloId: articulo(o.componente.articulo),
            efecto: o.componente.efecto,
            cantidad: o.componente.cantidad,
            unidadId: unidad(o.componente.unidad),
            sustituyeArticuloId: o.componente.sustituye ? articulo(o.componente.sustituye) : null,
          },
        });
    }
  }

  // --- Productos y variantes ------------------------------------------------------------------
  const productos = new Map<string, string>();
  const variantes = new Map<string, string>();
  for (const p of d.productos) {
    const producto = await db.producto.create({
      data: {
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        tipo: p.tipo,
        categoriaId: categorias.get(p.categoria)!,
        visibleEnMenu: true,
      },
    });
    productos.set(p.codigo, producto.id);
    for (const [orden, v] of p.variantes.entries()) {
      const variante = await db.varianteProducto.create({
        data: {
          productoId: producto.id,
          sku: v.sku,
          nombre: v.nombre,
          orden,
          articuloInventarioId: v.articulo ? articulo(v.articulo) : null,
        },
      });
      variantes.set(v.sku, variante.id);
      for (const [posicion, codigo] of v.grupos.entries()) {
        const g = grupos.get(codigo)!;
        await db.varianteGrupoModificador.create({
          data: { varianteId: variante.id, grupoId: g.id, orden: posicion, obligatorio: g.minimo > 0 },
        });
      }
      await db.precioVariante.create({
        data: { varianteId: variante.id, sucursalId: sucursal.id, importe: v.precio, vigenteDesde: ahora },
      });
    }
  }
  for (const r of d.recetasVenta) {
    const receta = await db.receta.create({ data: { nombre: r.nombre, tipo: 'VENTA', varianteId: variantes.get(r.sku)! } });
    // Una unidad vendida: rendimiento 1 en «unidad».
    await escribirVersion(receta.id, r.componentes, 1, 'UND', null);
  }
  avance(`${productos.size} productos, ${variantes.size} variantes con precio, ${d.recetasProduccion.length + d.recetasVenta.length} recetas publicadas`);

  // --- Desechables ---------------------------------------------------------------------------
  for (const r of d.reglasEmpaque) {
    await db.reglaEmpaque.create({
      data: {
        nombre: r.nombre,
        alcance: 'ARTICULO',
        modalidad: r.modalidad,
        varianteId: variantes.get(r.sku)!,
        sucursalId: null,
        reglaEmpaqueLineasComoRegla: {
          create: r.lineas.map((l) => ({ articuloId: articulo(l.articulo), cantidad: l.cantidad })),
        },
      },
    });
  }

  // --- Menús ---------------------------------------------------------------------------------
  for (const m of d.menus) {
    const menu = await db.menu.create({ data: { codigo: m.codigo, nombre: m.nombre, publicadoEn: ahora } });
    if (m.horario.length)
      await db.menuHorario.createMany({
        data: m.horario.map((h) => ({ menuId: menu.id, diaSemana: h.diaSemana, desde: h.desde, hasta: h.hasta, activo: true })),
      });
    for (const [orden, s] of m.secciones.entries()) {
      const seccion = await db.menuSeccion.create({ data: { menuId: menu.id, nombre: s.nombre, orden } });
      await db.menuItem.createMany({
        data: s.skus.map((sku, i) => ({ seccionId: seccion.id, varianteId: variantes.get(sku)!, orden: i })),
      });
    }
    await db.menuSucursal.create({ data: { menuId: menu.id, sucursalId: sucursal.id, activa: true } });
  }
  avance(`${d.reglasEmpaque.length} reglas de desechables, ${d.menus.length} menú(s) publicados`);

  // --- Cuentas y formas de pago ------------------------------------------------------------------
  const cuentas = new Map<string, string>();
  for (const c of d.cuentas) {
    const row = await db.cuentaFinanciera.create({
      data: { sucursalId: sucursal.id, nombre: c.nombre, tipo: c.tipo, moneda: 'GTQ', activa: true },
    });
    cuentas.set(c.nombre, row.id);
  }
  for (const r of d.rutasPago)
    await db.rutaFinanciera.upsert({
      where: { sucursalId_metodo: { sucursalId: sucursal.id, metodo: r.metodo } },
      update: { cuentaFinancieraId: cuentas.get(r.cuenta)!, activa: true },
      create: { sucursalId: sucursal.id, metodo: r.metodo, cuentaFinancieraId: cuentas.get(r.cuenta)!, activa: true },
    });
  // El efectivo se queda en la caja del turno: no lleva ruta.
  await db.rutaFinanciera.deleteMany({ where: { sucursalId: sucursal.id, metodo: 'EFECTIVO' } });

  // --- Plataformas de delivery -------------------------------------------------------------------
  for (const c of d.canales)
    await db.canalExterno.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, activo: c.activo },
      create: { codigo: c.codigo, nombre: c.nombre, activo: c.activo },
    });

  // --- Usuarios ---------------------------------------------------------------------------------
  const roles = new Map<string, string>((await db.rol.findMany({ select: { id: true, codigo: true } })).map((r: { id: string; codigo: string }) => [r.codigo, r.id] as const));
  const usuarios = new Map<string, string>();
  for (const u of d.usuarios) {
    if (await db.usuario.findUnique({ where: { email: u.email } }))
      throw Error(`Ya existe un usuario con el correo ${u.email}. La carga corre sobre una base recién preparada.`);
    const usuario = await db.usuario.create({
      data: {
        email: u.email,
        nombre: u.nombre,
        hashContrasena,
        // Entran con la contraseña inicial y el sistema les pide cambiarla.
        debeCambiarContrasena: true,
        perfil: { create: {} },
      },
    });
    usuarios.set(u.email, usuario.id);
    for (const codigo of u.roles) {
      const rolId = roles.get(codigo);
      if (!rolId) throw Error(`Falta el rol ${codigo}: ejecute primero "npm run seed:initial".`);
      // Superadministración es global; los demás roles son de la sucursal.
      await db.usuarioRol.create({
        data: { usuarioId: usuario.id, rolId, sucursalId: codigo === 'SUPER_ADMIN' ? null : sucursal.id },
      });
    }
  }
  avance(`${d.cuentas.length} cuenta(s), ${d.rutasPago.length} forma(s) de pago enrutadas, ${d.canales.length} plataformas de delivery, ${usuarios.size} usuarios`);

  return { sucursalId: sucursal.id, ubicacionId: ubicacion.id, unidades, articulos, productos, variantes, mesas, usuarios };
}
