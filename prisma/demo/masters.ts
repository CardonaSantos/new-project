/**
 * Writes the demo masters: catalog, recipes, branches, menus, prices,
 * packaging, suppliers and staff.
 *
 * Masters go in through Prisma directly rather than the services, which is the
 * deliberate half of the hybrid: there is no costing or stock arithmetic to get
 * wrong here, and upserting them keeps the phase free to re-run. Everything
 * transactional — purchases, production, orders, payments — goes through the
 * real services in the later phases, so the numbers the demo shows are the
 * numbers the system produces.
 *
 * Codes carry the DEMO- prefix, which is how the reset finds its own rows.
 * Categories and modifier groups have no code column in this schema, so those
 * are matched by name instead of being renamed to carry a marker: a category
 * called "DEMO · Café" on screen would ruin the demo it exists for.
 */
import { argon2id, hash } from 'argon2';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { articles } from './articles.js';
import { categories, modifierGroups, products } from './products.js';
import { productionRecipes, saleRecipes } from './recipes.js';
import { basePrices, branches, menus } from './branches.js';
import { packagingRules, suppliers } from './supply.js';
import { DEMO_PREFIX, progress, type DemoOptions } from './runtime.js';

type Db = PrismaClient;
export const code = (raw: string): string => DEMO_PREFIX + raw;

/** Ids resolved while writing, so later phases don't re-query by code. */
export interface MasterIds {
  units: Map<string, string>;
  articles: Map<string, string>;
  variants: Map<string, string>;
  /** Modifier option code -> id, needed to put modifiers on order lines. */
  modifierOptions: Map<string, string>;
  branches: Map<string, string>;
  warehouses: Map<string, string>;
  locations: Map<string, string>;
  stations: Map<string, Map<string, string>>;
  registers: Map<string, Map<string, string>>;
  tables: Map<string, string[]>;
  suppliers: Map<string, string>;
  presentations: Map<string, string>;
  staff: Map<string, Map<string, string>>;
}

/** Units come from the initial seed; the demo refuses to invent them. */
async function loadUnits(db: Db): Promise<Map<string, string>> {
  const rows = await db.unidadMedida.findMany({ select: { id: true, codigo: true } });
  const units = new Map(rows.map((u) => [u.codigo, u.id]));
  for (const needed of ['UND', 'G', 'ML', 'LB', 'L']) {
    if (!units.has(needed))
      throw Error(
        `Falta la unidad ${needed}: ejecute primero "npm run seed:initial", que registra las unidades y sus conversiones.`,
      );
  }
  return units;
}

async function writeCategories(db: Db): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [index, category] of categories.entries()) {
    // No unique constraint on Categoria, so this is find-then-create.
    const found = await db.categoria.findFirst({ where: { nombre: category.nombre } });
    const row = found
      ? await db.categoria.update({ where: { id: found.id }, data: { orden: index, activa: true } })
      : await db.categoria.create({ data: { nombre: category.nombre, orden: index } });
    ids.set(category.codigo, row.id);
  }
  return ids;
}

async function writeArticles(db: Db, units: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const article of articles) {
    const row = await db.articuloInventario.upsert({
      where: { codigo: code(article.codigo) },
      update: {
        nombre: article.nombre,
        tipo: article.tipo,
        unidadBaseId: units.get(article.unidad)!,
        requiereLote: article.lote ?? false,
        requiereVencimiento: article.vencimiento ?? false,
        costoReferencia: article.costo,
        stockMinimo: article.stockMinimo ?? null,
        activo: true,
      },
      create: {
        codigo: code(article.codigo),
        nombre: article.nombre,
        tipo: article.tipo,
        unidadBaseId: units.get(article.unidad)!,
        requiereLote: article.lote ?? false,
        requiereVencimiento: article.vencimiento ?? false,
        costoReferencia: article.costo,
        stockMinimo: article.stockMinimo ?? null,
      },
    });
    ids.set(article.codigo, row.id);
  }
  return ids;
}

async function writeModifiers(
  db: Db,
  units: Map<string, string>,
  articleIds: Map<string, string>,
): Promise<{ groups: Map<string, string>; options: Map<string, string> }> {
  const groups = new Map<string, string>();
  const options = new Map<string, string>();
  for (const group of modifierGroups) {
    const found = await db.grupoModificador.findFirst({ where: { nombre: group.nombre } });
    const groupRow = found
      ? await db.grupoModificador.update({
          where: { id: found.id },
          data: { minimo: group.minimo, maximo: group.maximo, activo: true },
        })
      : await db.grupoModificador.create({
          data: { nombre: group.nombre, minimo: group.minimo, maximo: group.maximo },
        });
    groups.set(group.codigo, groupRow.id);

    for (const option of group.opciones) {
      const optionRow = await db.modificador.upsert({
        where: { grupoId_nombre: { grupoId: groupRow.id, nombre: option.nombre } },
        update: { incrementoPrecio: option.precio, activo: true },
        create: { grupoId: groupRow.id, nombre: option.nombre, incrementoPrecio: option.precio },
      });
      options.set(option.codigo, optionRow.id);

      // Rewritten rather than merged: the data file is the source of truth for
      // what an option does, and a stale component would silently keep
      // consuming an ingredient the option no longer touches.
      await db.modificadorComponente.deleteMany({ where: { modificadorId: optionRow.id } });
      const component = option.componente;
      if (!component) continue;
      const article = articles.find((a) => a.codigo === component.articulo)!;
      await db.modificadorComponente.create({
        data: {
          modificadorId: optionRow.id,
          articuloId: articleIds.get(component.articulo)!,
          efecto: component.efecto,
          cantidad: component.cantidad,
          unidadId: units.get(article.unidad)!,
          sustituyeArticuloId: component.sustituye ? articleIds.get(component.sustituye)! : null,
        },
      });
    }
  }
  return { groups, options };
}

async function writeProducts(
  db: Db,
  categoryIds: Map<string, string>,
  articleIds: Map<string, string>,
  groupIds: Map<string, string>,
): Promise<Map<string, string>> {
  const variantIds = new Map<string, string>();
  for (const product of products) {
    const productRow = await db.producto.upsert({
      where: { codigo: code(product.codigo) },
      update: {
        nombre: product.nombre,
        descripcion: product.descripcion ?? null,
        tipo: product.tipo,
        categoriaId: categoryIds.get(product.categoria)!,
        activo: true,
        visibleEnMenu: true,
      },
      create: {
        codigo: code(product.codigo),
        nombre: product.nombre,
        descripcion: product.descripcion ?? null,
        tipo: product.tipo,
        categoriaId: categoryIds.get(product.categoria)!,
        visibleEnMenu: true,
      },
    });

    for (const [order, variant] of product.variantes.entries()) {
      const variantRow = await db.varianteProducto.upsert({
        where: { sku: code(variant.sku) },
        update: {
          nombre: variant.nombre,
          orden: order,
          activo: true,
          articuloInventarioId: variant.articulo ? articleIds.get(variant.articulo)! : null,
        },
        create: {
          productoId: productRow.id,
          sku: code(variant.sku),
          nombre: variant.nombre,
          orden: order,
          articuloInventarioId: variant.articulo ? articleIds.get(variant.articulo)! : null,
        },
      });
      variantIds.set(variant.sku, variantRow.id);

      for (const [position, groupCode] of (variant.modificadores ?? []).entries()) {
        const group = modifierGroups.find((g) => g.codigo === groupCode)!;
        await db.varianteGrupoModificador.upsert({
          where: { varianteId_grupoId: { varianteId: variantRow.id, grupoId: groupIds.get(groupCode)! } },
          update: { orden: position, obligatorio: group.minimo > 0 },
          create: {
            varianteId: variantRow.id,
            grupoId: groupIds.get(groupCode)!,
            orden: position,
            // A group that demands a pick is required on the line, which is
            // what makes "término de cocción" impossible to skip.
            obligatorio: group.minimo > 0,
          },
        });
      }
    }
  }
  return variantIds;
}

/**
 * Recipes are written with one published version each.
 *
 * Publishing matters: sending an order with an unpublished recipe fails with
 * "Producto sin receta publicada", so a demo whose recipes are drafts cannot
 * take a single order.
 */
async function writeRecipes(
  db: Db,
  units: Map<string, string>,
  articleIds: Map<string, string>,
  variantIds: Map<string, string>,
  now: Date,
): Promise<void> {
  const writeVersion = async (
    recipeId: string,
    components: { articulo: string; cantidad: number; merma?: number }[],
    yieldAmount: number,
    yieldUnit: string,
    shelfLife: number | null,
  ) => {
    const existing = await db.recetaVersion.findFirst({ where: { recetaId: recipeId, numero: 1 } });
    const version = existing
      ? await db.recetaVersion.update({
          where: { id: existing.id },
          data: {
            rendimiento: yieldAmount,
            unidadRendimientoId: units.get(yieldUnit)!,
            publicadaEn: existing.publicadaEn ?? now,
            activa: true,
            vidaUtilDias: shelfLife,
          },
        })
      : await db.recetaVersion.create({
          data: {
            recetaId: recipeId,
            numero: 1,
            rendimiento: yieldAmount,
            unidadRendimientoId: units.get(yieldUnit)!,
            publicadaEn: now,
            activa: true,
            vidaUtilDias: shelfLife,
          },
        });
    await db.recetaComponente.deleteMany({ where: { recetaVersionId: version.id } });
    for (const component of components) {
      const article = articles.find((a) => a.codigo === component.articulo)!;
      await db.recetaComponente.create({
        data: {
          recetaVersionId: version.id,
          articuloId: articleIds.get(component.articulo)!,
          cantidad: component.cantidad,
          unidadId: units.get(article.unidad)!,
          mermaPorcentaje: component.merma ?? 0,
        },
      });
    }
  };

  for (const recipe of productionRecipes) {
    const resultArticle = articles.find((a) => a.codigo === recipe.resultado)!;
    const articleId = articleIds.get(recipe.resultado)!;
    const found = await db.receta.findFirst({
      where: { tipo: 'PRODUCCION', articuloResultadoId: articleId },
    });
    const row = found
      ? await db.receta.update({ where: { id: found.id }, data: { nombre: recipe.nombre, activa: true } })
      : await db.receta.create({
          data: { nombre: recipe.nombre, tipo: 'PRODUCCION', articuloResultadoId: articleId },
        });
    await writeVersion(row.id, recipe.componentes, recipe.rendimiento, resultArticle.unidad, recipe.vidaUtilDias ?? null);
  }

  for (const recipe of saleRecipes) {
    const variantId = variantIds.get(recipe.sku)!;
    const found = await db.receta.findFirst({ where: { tipo: 'VENTA', varianteId: variantId } });
    const row = found
      ? await db.receta.update({ where: { id: found.id }, data: { nombre: recipe.nombre, activa: true } })
      : await db.receta.create({ data: { nombre: recipe.nombre, tipo: 'VENTA', varianteId: variantId } });
    // One sold unit, so yield is 1 and the unit is just "unidad".
    await writeVersion(row.id, recipe.componentes, 1, 'UND', null);
  }
}

async function writeBranches(
  db: Db,
  categoryIds: Map<string, string>,
  selected: string[],
): Promise<Pick<MasterIds, 'branches' | 'warehouses' | 'locations' | 'stations' | 'registers' | 'tables'>> {
  const branchIds = new Map<string, string>();
  const warehouses = new Map<string, string>();
  const locations = new Map<string, string>();
  const stations = new Map<string, Map<string, string>>();
  const registers = new Map<string, Map<string, string>>();
  const tables = new Map<string, string[]>();

  for (const branch of branches) {
    if (selected.length && !selected.includes(branch.codigo)) continue;
    const branchRow = await db.sucursal.upsert({
      where: { codigo: code(branch.codigo) },
      update: { nombre: branch.nombre, direccion: branch.direccion, telefono: branch.telefono, activa: true },
      create: {
        codigo: code(branch.codigo),
        nombre: branch.nombre,
        direccion: branch.direccion,
        telefono: branch.telefono,
        zonaHoraria: 'America/Guatemala',
      },
    });
    branchIds.set(branch.codigo, branchRow.id);

    await db.configuracionSucursal.upsert({
      where: { sucursalId: branchRow.id },
      update: { permiteOrdenesQR: true, moneda: 'GTQ' },
      // QR ordering on by default: every branch demonstrates it, and the flag
      // is what the self-service endpoints check before accepting an order.
      create: { sucursalId: branchRow.id, permiteOrdenesQR: true, moneda: 'GTQ' },
    });

    const warehouse = await db.almacen.upsert({
      where: { sucursalId_codigo: { sucursalId: branchRow.id, codigo: 'PRINCIPAL' } },
      update: { nombre: 'Almacén principal', activo: true },
      create: { sucursalId: branchRow.id, codigo: 'PRINCIPAL', nombre: 'Almacén principal' },
    });
    warehouses.set(branch.codigo, warehouse.id);

    const location = await db.ubicacionAlmacen.upsert({
      where: { almacenId_codigo: { almacenId: warehouse.id, codigo: 'GENERAL' } },
      update: { nombre: 'General', esRecepcion: true, activa: true },
      create: { almacenId: warehouse.id, codigo: 'GENERAL', nombre: 'General', esRecepcion: true },
    });
    locations.set(branch.codigo, location.id);

    const branchStations = new Map<string, string>();
    for (const station of branch.estaciones) {
      const row = await db.estacionPreparacion.upsert({
        where: { sucursalId_nombre: { sucursalId: branchRow.id, nombre: station.nombre } },
        update: { ubicacionConsumoId: location.id, activa: true },
        create: { sucursalId: branchRow.id, nombre: station.nombre, ubicacionConsumoId: location.id },
      });
      branchStations.set(station.nombre, row.id);
      for (const category of station.categorias) {
        const categoryId = categoryIds.get(category)!;
        const existing = await db.rutaPreparacion.findFirst({
          where: { estacionId: row.id, categoriaId: categoryId, varianteId: null },
        });
        if (!existing)
          await db.rutaPreparacion.create({
            data: { estacionId: row.id, categoriaId: categoryId, prioridad: 0 },
          });
      }
    }
    stations.set(branch.codigo, branchStations);

    const branchTables: string[] = [];
    for (const [roomIndex, room] of branch.salas.entries()) {
      const roomRow = await db.sala.upsert({
        where: { sucursalId_nombre: { sucursalId: branchRow.id, nombre: room.nombre } },
        update: { orden: roomIndex, activa: true },
        create: { sucursalId: branchRow.id, nombre: room.nombre, orden: roomIndex },
      });
      for (const [tableIndex, numero] of room.mesas.entries()) {
        const table = await db.mesa.upsert({
          where: { salaId_numero: { salaId: roomRow.id, numero } },
          update: { activa: true },
          create: {
            salaId: roomRow.id,
            numero,
            capacidad: room.capacidades[tableIndex % room.capacidades.length],
          },
        });
        branchTables.push(table.id);
      }
    }
    tables.set(branch.codigo, branchTables);

    const branchRegisters = new Map<string, string>();
    for (const register of branch.cajas) {
      const row = await db.caja.upsert({
        where: { sucursalId_codigo: { sucursalId: branchRow.id, codigo: register } },
        update: { activa: true },
        create: {
          sucursalId: branchRow.id,
          codigo: register,
          nombre: 'Caja ' + register.replace('CAJA-', ''),
        },
      });
      branchRegisters.set(register, row.id);
    }
    registers.set(branch.codigo, branchRegisters);
  }

  return { branches: branchIds, warehouses, locations, stations, registers, tables };
}

async function writeMenusAndPrices(
  db: Db,
  branchIds: Map<string, string>,
  variantIds: Map<string, string>,
  now: Date,
): Promise<void> {
  const menuIds = new Map<string, string>();
  for (const menu of menus) {
    const row = await db.menu.upsert({
      where: { codigo: code(menu.codigo) },
      update: { nombre: menu.nombre, activo: true, publicadoEn: now },
      create: { codigo: code(menu.codigo), nombre: menu.nombre, publicadoEn: now },
    });
    menuIds.set(menu.codigo, row.id);
    for (const [sectionIndex, section] of menu.secciones.entries()) {
      const sectionRow = await db.menuSeccion.upsert({
        where: { menuId_nombre: { menuId: row.id, nombre: section.nombre } },
        update: { orden: sectionIndex, activa: true },
        create: { menuId: row.id, nombre: section.nombre, orden: sectionIndex },
      });
      for (const [itemIndex, sku] of section.skus.entries()) {
        await db.menuItem.upsert({
          where: { seccionId_varianteId: { seccionId: sectionRow.id, varianteId: variantIds.get(sku)! } },
          update: { orden: itemIndex, activo: true },
          create: { seccionId: sectionRow.id, varianteId: variantIds.get(sku)!, orden: itemIndex },
        });
      }
    }
  }

  for (const branch of branches) {
    const branchId = branchIds.get(branch.codigo);
    if (!branchId) continue;
    for (const menuCode of branch.menus) {
      await db.menuSucursal.upsert({
        where: { menuId_sucursalId: { menuId: menuIds.get(menuCode)!, sucursalId: branchId } },
        update: { activa: true },
        create: { menuId: menuIds.get(menuCode)!, sucursalId: branchId, activa: true },
      });
    }

    // Prices are per branch: the same americano costs one thing in zona 1 and
    // another in zona 10, which is the clearest demonstration that the catalog
    // is shared while the business is local.
    const offered = new Set(
      branch.menus.flatMap((c) => menus.find((m) => m.codigo === c)!.secciones.flatMap((s) => s.skus)),
    );
    for (const sku of offered) {
      const variantId = variantIds.get(sku)!;
      const amount = Math.round(basePrices[sku] * branch.factorPrecio);
      const current = await db.precioVariante.findFirst({
        where: { varianteId: variantId, sucursalId: branchId, vigenteHasta: null },
      });
      if (current) {
        if (current.importe.equals(amount)) continue;
        await db.precioVariante.update({ where: { id: current.id }, data: { vigenteHasta: now } });
      }
      await db.precioVariante.create({
        data: { varianteId: variantId, sucursalId: branchId, importe: amount, vigenteDesde: now },
      });
    }
  }
}

async function writePackaging(
  db: Db,
  articleIds: Map<string, string>,
  variantIds: Map<string, string>,
  branchIds: Map<string, string>,
): Promise<void> {
  for (const rule of packagingRules) {
    const variantId = rule.sku ? variantIds.get(rule.sku)! : null;
    const branchId = rule.sucursal ? branchIds.get(rule.sucursal) ?? null : null;
    const existing = await db.reglaEmpaque.findFirst({ where: { nombre: rule.nombre } });
    const row = existing
      ? await db.reglaEmpaque.update({
          where: { id: existing.id },
          data: { alcance: rule.alcance, modalidad: rule.modalidad, varianteId: variantId, sucursalId: branchId, activa: true },
        })
      : await db.reglaEmpaque.create({
          data: {
            nombre: rule.nombre,
            alcance: rule.alcance,
            modalidad: rule.modalidad,
            varianteId: variantId,
            sucursalId: branchId,
          },
        });
    await db.reglaEmpaqueLinea.deleteMany({ where: { reglaId: row.id } });
    for (const line of rule.lineas)
      await db.reglaEmpaqueLinea.create({
        data: { reglaId: row.id, articuloId: articleIds.get(line.articulo)!, cantidad: line.cantidad },
      });
  }
}

async function writeSuppliers(
  db: Db,
  units: Map<string, string>,
  articleIds: Map<string, string>,
): Promise<{ suppliers: Map<string, string>; presentations: Map<string, string> }> {
  const supplierIds = new Map<string, string>();
  const presentationIds = new Map<string, string>();
  const LB_IN_GRAMS = 453.59237;
  for (const supplier of suppliers) {
    const existing = await db.proveedor.findFirst({ where: { nit: supplier.nit } });
    const row = existing
      ? await db.proveedor.update({
          where: { id: existing.id },
          data: { nombre: supplier.nombre, telefono: supplier.telefono, activo: true },
        })
      : await db.proveedor.create({
          data: { nombre: supplier.nombre, nit: supplier.nit, telefono: supplier.telefono },
        });
    supplierIds.set(supplier.codigo, row.id);

    for (const presentation of supplier.presentaciones) {
      const article = articles.find((a) => a.codigo === presentation.articulo)!;
      // factorAUnidadBase converts ONE purchase unit into base units; the pack
      // size lives on the order line as cantidadCompra, since that is how the
      // purchase store computes base = cantidadCompra * factorAUnidadBase.
      const factor =
        presentation.unidadCompra === article.unidad
          ? 1
          : presentation.unidadCompra === 'LB'
            ? LB_IN_GRAMS
            : presentation.unidadCompra === 'L'
              ? 1000
              : null;
      if (factor === null)
        throw Error(
          `Presentación "${presentation.nombre}": no sé convertir ${presentation.unidadCompra} a ${article.unidad}`,
        );
      const found = await db.presentacionCompra.findFirst({
        where: { proveedorId: row.id, nombre: presentation.nombre },
      });
      const presentationRow = found
        ? await db.presentacionCompra.update({
            where: { id: found.id },
            data: {
              articuloId: articleIds.get(presentation.articulo)!,
              unidadCompraId: units.get(presentation.unidadCompra)!,
              factorAUnidadBase: factor,
              activa: true,
            },
          })
        : await db.presentacionCompra.create({
            data: {
              articuloId: articleIds.get(presentation.articulo)!,
              proveedorId: row.id,
              nombre: presentation.nombre,
              unidadCompraId: units.get(presentation.unidadCompra)!,
              factorAUnidadBase: factor,
            },
          });
      presentationIds.set(`${supplier.codigo}:${presentation.articulo}`, presentationRow.id);
    }
  }
  return { suppliers: supplierIds, presentations: presentationIds };
}

/** One account per operational role per branch, so the demo can be shown from
 * each point of view instead of everything through the administrator. */
const STAFF = [
  { rol: 'ADMIN_SUCURSAL', usuario: 'gerente', nombre: 'Gerente' },
  { rol: 'CAJERO', usuario: 'cajero', nombre: 'Cajero' },
  { rol: 'MESERO', usuario: 'mesero', nombre: 'Mesero' },
  { rol: 'COCINA', usuario: 'cocina', nombre: 'Cocina' },
  { rol: 'ALMACEN', usuario: 'almacen', nombre: 'Almacén' },
] as const;

async function writeStaff(
  db: Db,
  branchIds: Map<string, string>,
  password: string,
): Promise<Map<string, Map<string, string>>> {
  const hashed = await hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const staff = new Map<string, Map<string, string>>();
  for (const branch of branches) {
    const branchId = branchIds.get(branch.codigo);
    if (!branchId) continue;
    const perBranch = new Map<string, string>();
    for (const member of STAFF) {
      const role = await db.rol.findUnique({ where: { codigo: member.rol } });
      if (!role)
        throw Error(`Falta el rol ${member.rol}: ejecute primero "npm run seed:initial", que crea los roles operativos.`);
      const email = `${member.usuario}.${branch.codigo.toLowerCase()}@demo.local`;
      const existing = await db.usuario.findUnique({ where: { email } });
      const user = existing
        ? await db.usuario.update({
            where: { id: existing.id },
            // The password is reset on every run so a forgotten demo password
            // is never a reason to rebuild the whole dataset.
            data: { hashContrasena: hashed, activo: true, debeCambiarContrasena: false },
          })
        : await db.usuario.create({
            data: {
              email,
              nombre: `${member.nombre} ${branch.nombre}`,
              hashContrasena: hashed,
              debeCambiarContrasena: false,
              perfil: { create: {} },
            },
          });
      const assigned = await db.usuarioRol.findFirst({
        where: { usuarioId: user.id, rolId: role.id, sucursalId: branchId },
      });
      if (!assigned)
        await db.usuarioRol.create({ data: { usuarioId: user.id, rolId: role.id, sucursalId: branchId } });
      perBranch.set(member.rol, user.id);
    }
    staff.set(branch.codigo, perBranch);
  }
  return staff;
}

export async function writeMasters(db: Db, options: DemoOptions, password: string): Promise<MasterIds> {
  const now = new Date();
  const units = await loadUnits(db);

  progress('maestros', `categorías y ${articles.length} artículos de inventario`);
  const categoryIds = await writeCategories(db);
  const articleIds = await writeArticles(db, units);

  progress('maestros', `${modifierGroups.length} grupos de modificadores`);
  const { groups, options: modifierOptions } = await writeModifiers(db, units, articleIds);

  progress('maestros', `${products.length} productos`);
  const variantIds = await writeProducts(db, categoryIds, articleIds, groups);

  progress('maestros', `${productionRecipes.length} recetas de producción y ${saleRecipes.length} de venta`);
  await writeRecipes(db, units, articleIds, variantIds, now);

  const selected = options.sucursales;
  progress('maestros', `sucursales${selected.length ? ': ' + selected.join(', ') : ''}`);
  const branchData = await writeBranches(db, categoryIds, selected);

  progress('maestros', `${menus.length} menús y sus precios por sucursal`);
  await writeMenusAndPrices(db, branchData.branches, variantIds, now);

  progress('maestros', `${packagingRules.length} reglas de empaque`);
  await writePackaging(db, articleIds, variantIds, branchData.branches);

  progress('maestros', `${suppliers.length} proveedores y sus presentaciones`);
  const supplierData = await writeSuppliers(db, units, articleIds);

  progress('maestros', `usuarios por rol (${STAFF.length} por sucursal)`);
  const staff = await writeStaff(db, branchData.branches, password);

  return {
    units,
    articles: articleIds,
    variants: variantIds,
    modifierOptions,
    ...branchData,
    suppliers: supplierData.suppliers,
    presentations: supplierData.presentations,
    staff,
  };
}
