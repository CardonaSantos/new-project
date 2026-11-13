/**
 * Consistency checks for the demo data, runnable without a database.
 *
 * The seed runs these before writing anything: a referential mistake here
 * otherwise surfaces as a half-written database partway into a run that takes
 * the better part of an hour. Every rule exists either because the schema
 * enforces it — and failing early beats failing at insert time — or because it
 * caught a real mistake while this data was being written.
 */
import { articles, type DemoArticle } from './articles.js';
import { products, categories, modifierGroups } from './products.js';
import { branches, menus, basePrices } from './branches.js';
import { packagingRules, suppliers } from './supply.js';
import { productionRecipes, saleRecipes } from './recipes.js';

/** One pound in grams, as registered by the initial seed's conversions. */
const LB = 453.59237;
/** Purchase unit -> how many base units it holds, per stocking unit. */
const TO_BASE: Record<string, Record<string, number>> = {
  UND: { UND: 1 },
  G: { G: 1, LB },
  ML: { ML: 1, L: 1000 },
};

export function validateDemoData(): string[] {
  const fail: string[] = [];
  const art = new Map<string, DemoArticle>(articles.map((a) => [a.codigo, a]));
  const cat = new Set(categories.map((c) => c.codigo));
  const variants = products.flatMap((p) =>
    p.variantes.map((v) => ({ ...v, tipo: p.tipo, categoria: p.categoria, producto: p.codigo })),
  );
  const sku = new Map(variants.map((v) => [v.sku, v]));
  const groups = new Map(modifierGroups.map((g) => [g.codigo, g]));
  const menuByCode = new Map(menus.map((m) => [m.codigo, m]));

  const duplicates = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];
  const unique: [string, string[]][] = [
    ['artículo', articles.map((a) => a.codigo)],
    ['producto', products.map((p) => p.codigo)],
    ['SKU', variants.map((v) => v.sku)],
    ['categoría', categories.map((c) => c.codigo)],
    ['grupo de modificadores', modifierGroups.map((g) => g.codigo)],
    ['opción de modificador', modifierGroups.flatMap((g) => g.opciones.map((o) => o.codigo))],
    ['receta de producción', productionRecipes.map((r) => r.codigo)],
    ['receta de venta', saleRecipes.map((r) => r.sku)],
    ['sucursal', branches.map((b) => b.codigo)],
    ['menú', menus.map((m) => m.codigo)],
    ['proveedor', suppliers.map((s) => s.codigo)],
  ];
  for (const [label, values] of unique) {
    const dupes = duplicates(values);
    if (dupes.length) fail.push(`${label} duplicado: ${dupes.join(', ')}`);
  }

  for (const p of products) {
    if (!cat.has(p.categoria)) fail.push(`producto ${p.codigo} apunta a categoría inexistente ${p.categoria}`);
    if (!p.variantes.length) fail.push(`producto ${p.codigo} sin variantes`);
  }

  for (const v of variants) {
    if (v.tipo === 'INVENTARIABLE') {
      if (!v.articulo) fail.push(`${v.sku} es INVENTARIABLE sin artículo de inventario`);
      else if (!art.has(v.articulo)) fail.push(`${v.sku} apunta a artículo inexistente ${v.articulo}`);
      // Direct sale deducts whole units, so the article has to be stocked that way.
      else if (art.get(v.articulo)!.unidad !== 'UND')
        fail.push(`${v.sku} vende ${v.articulo}, que no se inventaría en unidades`);
    } else if (v.articulo) fail.push(`${v.sku} es ${v.tipo} pero trae artículo de inventario`);
    for (const g of v.modificadores ?? [])
      if (!groups.has(g)) fail.push(`${v.sku} ofrece el grupo inexistente ${g}`);
    if (basePrices[v.sku] === undefined) fail.push(`${v.sku} sin precio base`);
  }
  for (const k of Object.keys(basePrices))
    if (!sku.has(k)) fail.push(`precio base para SKU inexistente ${k}`);

  // Sending an order fails outright when a prepared line has no published
  // recipe, so coverage here is not optional.
  const prepared = new Set(variants.filter((v) => v.tipo === 'PREPARADO').map((v) => v.sku));
  const withRecipe = new Set(saleRecipes.map((r) => r.sku));
  for (const s of prepared) if (!withRecipe.has(s)) fail.push(`variante PREPARADO sin receta de venta: ${s}`);
  for (const s of withRecipe) {
    if (!sku.has(s)) fail.push(`receta de venta sobre SKU inexistente: ${s}`);
    else if (!prepared.has(s)) fail.push(`receta de venta sobre variante que no es PREPARADO: ${s}`);
  }

  for (const r of [...productionRecipes, ...saleRecipes]) {
    const id = 'codigo' in r ? r.codigo : r.sku;
    if (!r.componentes.length) fail.push(`receta ${id} sin componentes`);
    const seen = new Set<string>();
    for (const c of r.componentes) {
      if (!art.has(c.articulo)) fail.push(`receta ${id} usa artículo inexistente ${c.articulo}`);
      // RecetaComponente has @@unique([recetaVersionId, articuloId]).
      if (seen.has(c.articulo)) fail.push(`receta ${id} repite el artículo ${c.articulo}`);
      seen.add(c.articulo);
      if (!(c.cantidad > 0)) fail.push(`receta ${id}: cantidad inválida en ${c.articulo}`);
      if (c.merma !== undefined && (c.merma < 0 || c.merma >= 100))
        fail.push(`receta ${id}: merma fuera de rango en ${c.articulo}`);
    }
  }

  for (const r of productionRecipes) {
    const result = art.get(r.resultado);
    if (!result) fail.push(`producción ${r.codigo} produce artículo inexistente ${r.resultado}`);
    else if (!['PREPARACION', 'PRODUCTO_TERMINADO'].includes(result.tipo))
      fail.push(`producción ${r.codigo} produce ${r.resultado}, de tipo ${result.tipo}`);
    if (!(r.rendimiento > 0)) fail.push(`producción ${r.codigo}: rendimiento inválido`);
    if (r.componentes.some((c) => c.articulo === r.resultado))
      fail.push(`producción ${r.codigo} se consume a sí misma`);
  }
  const produced = new Set(productionRecipes.map((r) => r.resultado));
  for (const a of articles)
    if (a.tipo === 'PREPARACION' && !produced.has(a.codigo))
      fail.push(`preparación sin receta que la produzca: ${a.codigo}`);

  for (const g of modifierGroups) {
    if (g.minimo > g.maximo) fail.push(`grupo ${g.codigo}: mínimo mayor que máximo`);
    if (g.minimo > g.opciones.length)
      fail.push(`grupo ${g.codigo} exige ${g.minimo} opciones pero ofrece ${g.opciones.length}`);
    for (const o of g.opciones) {
      const c = o.componente;
      if (!c) continue;
      if (!art.has(c.articulo)) fail.push(`modificador ${o.codigo} usa artículo inexistente ${c.articulo}`);
      if (!(c.cantidad > 0)) fail.push(`modificador ${o.codigo}: cantidad inválida`);
      if (c.efecto === 'SUSTITUIR') {
        if (!c.sustituye) fail.push(`modificador ${o.codigo}: SUSTITUIR sin artículo sustituido`);
        else if (!art.has(c.sustituye)) fail.push(`modificador ${o.codigo} sustituye artículo inexistente`);
        else if (c.sustituye === c.articulo) fail.push(`modificador ${o.codigo} sustituye al mismo artículo`);
      } else if (c.sustituye) fail.push(`modificador ${o.codigo}: sustituye solo aplica a SUSTITUIR`);
    }
  }
  // An option that removes or swaps an ingredient the recipe never had is a
  // promise to the customer that changes nothing.
  for (const v of variants) {
    const recipe = saleRecipes.find((r) => r.sku === v.sku);
    if (!recipe) continue;
    for (const code of v.modificadores ?? []) {
      for (const o of groups.get(code)?.opciones ?? []) {
        const c = o.componente;
        if (!c || c.efecto === 'SUMAR') continue;
        const target = c.efecto === 'SUSTITUIR' ? c.sustituye! : c.articulo;
        if (!recipe.componentes.some((rc) => rc.articulo === target))
          fail.push(`${v.sku} ofrece "${o.nombre}" pero su receta no lleva ${target}`);
      }
    }
  }

  for (const b of branches) {
    const share = Object.values(b.modalidades).reduce((x, y) => x + y, 0);
    if (Math.abs(share - 1) > 0.001) fail.push(`${b.codigo}: las modalidades suman ${share.toFixed(3)}`);
    if (!b.estaciones.length) fail.push(`${b.codigo} sin estaciones`);
    const stationNames = b.estaciones.map((e) => e.nombre);
    if (duplicates(stationNames).length) fail.push(`${b.codigo}: estaciones con nombre repetido`);
    if (duplicates(b.salas.map((s) => s.nombre)).length) fail.push(`${b.codigo}: salas con nombre repetido`);
    if (duplicates(b.cajas).length) fail.push(`${b.codigo}: cajas repetidas`);
    for (const s of b.salas) {
      if (duplicates(s.mesas).length) fail.push(`${b.codigo}/${s.nombre}: mesas repetidas`);
      if (!s.capacidades.length) fail.push(`${b.codigo}/${s.nombre}: sin capacidades`);
    }
    const routed = b.estaciones.flatMap((e) => e.categorias);
    for (const c of routed) if (!cat.has(c)) fail.push(`${b.codigo} rutea categoría inexistente ${c}`);
    const twice = duplicates(routed);
    if (twice.length) fail.push(`${b.codigo}: categoría ruteada a dos estaciones: ${twice.join(', ')}`);

    const offered: string[] = [];
    for (const code of b.menus) {
      const menu = menuByCode.get(code);
      if (!menu) { fail.push(`${b.codigo} apunta a menú inexistente ${code}`); continue; }
      offered.push(...menu.secciones.flatMap((s) => s.skus));
    }
    const routedSet = new Set(routed);
    for (const k of offered) {
      const v = sku.get(k);
      // With more than one active station there is no single-station fallback,
      // so an unrouted category means "send to kitchen" fails on that line.
      if (v?.tipo === 'PREPARADO' && !routedSet.has(v.categoria))
        fail.push(`${b.codigo} ofrece ${k} (${v.categoria}) pero ninguna estación cubre esa categoría`);
    }
  }

  for (const m of menus) {
    const seen = new Set<string>();
    for (const s of m.secciones) {
      if (!s.skus.length) fail.push(`${m.codigo}/${s.nombre}: sección vacía`);
      for (const k of s.skus) {
        if (!sku.has(k)) fail.push(`${m.codigo} lista SKU inexistente ${k}`);
        if (seen.has(k)) fail.push(`${m.codigo} repite ${k} en dos secciones`);
        seen.add(k);
      }
    }
  }

  for (const r of packagingRules) {
    if (r.sku && !sku.has(r.sku)) fail.push(`empaque "${r.nombre}": SKU inexistente ${r.sku}`);
    if (r.sucursal && !branches.some((b) => b.codigo === r.sucursal))
      fail.push(`empaque "${r.nombre}": sucursal inexistente`);
    if (r.alcance === 'ORDEN' && r.sku) fail.push(`empaque "${r.nombre}": alcance ORDEN no lleva SKU`);
    if (!r.lineas.length) fail.push(`empaque "${r.nombre}" sin líneas`);
    for (const l of r.lineas) {
      const a = art.get(l.articulo);
      if (!a) fail.push(`empaque "${r.nombre}": artículo inexistente ${l.articulo}`);
      else if (a.tipo !== 'EMPAQUE') fail.push(`empaque "${r.nombre}": ${l.articulo} no es de tipo EMPAQUE`);
      if (!(l.cantidad > 0)) fail.push(`empaque "${r.nombre}": cantidad inválida`);
    }
  }

  const purchasable = new Set<string>();
  for (const s of suppliers) {
    if (!s.presentaciones.length) fail.push(`proveedor ${s.codigo} sin presentaciones`);
    for (const pr of s.presentaciones) {
      const a = art.get(pr.articulo);
      if (!a) { fail.push(`${s.codigo} vende artículo inexistente ${pr.articulo}`); continue; }
      purchasable.add(pr.articulo);
      if (!(pr.cantidad > 0) || !(pr.precio > 0))
        fail.push(`${s.codigo}/"${pr.nombre}": cantidad o precio inválido`);
      // This is where unit mistakes hide: buying by the pound and stocking in
      // grams only works if the arithmetic agrees.
      const factor = TO_BASE[a.unidad]?.[pr.unidadCompra];
      if (factor === undefined) {
        fail.push(`${s.codigo}/"${pr.nombre}": no hay conversión de ${pr.unidadCompra} a ${a.unidad}`);
        continue;
      }
      const derived = pr.precio / (pr.cantidad * factor);
      if (Math.abs(derived - a.costo) / a.costo > 0.02)
        fail.push(
          `${a.codigo}: costo de referencia ${a.costo} contra ${derived.toFixed(6)} que implica "${pr.nombre}"`,
        );
    }
  }
  for (const a of articles) {
    const mustBuy = ['INGREDIENTE', 'EMPAQUE', 'SUMINISTRO'].includes(a.tipo) || a.codigo.startsWith('BEB-');
    if (mustBuy && !purchasable.has(a.codigo))
      fail.push(`artículo comprable sin presentación de compra: ${a.codigo}`);
  }

  return fail;
}

/** Costs of produced articles, resolved through nested production recipes. */
export function derivedCosts(): Map<string, number> {
  const costs = new Map(articles.map((a) => [a.codigo, a.costo]));
  // Three passes resolve a preparation made of preparations made of
  // ingredients, which is as deep as this data goes.
  for (let pass = 0; pass < 3; pass++) {
    for (const r of productionRecipes) {
      let total = 0;
      for (const c of r.componentes)
        total += (costs.get(c.articulo) ?? 0) * c.cantidad * (1 + (c.merma ?? 0) / 100);
      costs.set(r.resultado, total / r.rendimiento);
    }
  }
  return costs;
}
