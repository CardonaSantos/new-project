/**
 * Operational roles created by the initial seed.
 *
 * The point is that whoever installs the system can start creating staff right
 * away instead of hand-assembling permission sets from a list of ~110 codes.
 * These are starting points: the admin can edit them, and SUPER_ADMIN keeps
 * every permission regardless of what's here.
 *
 * All of them are SUCURSAL-scoped, so each assignment names the branch the
 * person actually works at.
 */
export const operationalRoles = [
  {
    codigo: 'ADMIN_SUCURSAL',
    nombre: 'Administrador de sucursal',
    descripcion: 'Opera y configura una sucursal completa, sin tocar la empresa ni el personal global.',
    permissions: [
      'branches.read', 'devices.read', 'devices.manage',
      'catalog.read', 'catalog.manage', 'catalog.prices.manage', 'catalog.menus.manage',
      'catalog.reports.read',
      'orders.read', 'orders.create', 'orders.manage', 'orders.cancel.prepared', 'orders.discount',
      'kitchen.read', 'kitchen.manage',
      'tables.read', 'tables.manage',
      'inventory.read', 'inventory.adjust', 'inventory.transfer', 'inventory.articles.manage',
      'inventory.warehouses.manage', 'inventory.reports.read', 'inventory.costs.read',
      'inventory.consume.internal',
      'recipes.read', 'recipes.manage', 'recipes.publish', 'recipes.produce',
      'recipes.production.read',
      'supply.request', 'supply.read', 'supply.send', 'supply.receive', 'supply.cancel',
      'purchases.read', 'purchases.manage', 'purchases.suppliers.manage',
      'purchases.presentations.manage', 'purchases.orders.create', 'purchases.receipts.create',
      'purchases.invoices.manage', 'purchases.returns.manage',
      'cash.read', 'cash.manage', 'cash.open', 'cash.close',
      'payments.read', 'payments.collect', 'payments.verify', 'payments.split', 'sales.read',
      'finance.read', 'finance.movements.read', 'finance.expenses.read', 'finance.expenses.create',
      'finance.closing.read', 'finance.closing.execute',
      'delivery.read', 'delivery.manage', 'delivery.payments.collect', 'delivery.settlements.read',
      'reservations.read', 'reservations.manage',
      'customers.read', 'customers.create', 'customers.manage',
      'reports.read',
      'media.read', 'media.upload',
      'users.read',
    ],
  },
  {
    codigo: 'CAJERO',
    nombre: 'Cajero',
    descripcion: 'Cobra cuentas, maneja su turno de caja y atiende el punto de venta.',
    permissions: [
      'catalog.read',
      'orders.read', 'orders.create', 'orders.manage',
      'tables.read', 'tables.manage',
      'cash.read', 'cash.open', 'cash.close',
      'payments.read', 'payments.collect', 'payments.verify', 'payments.split', 'sales.read',
      // Un gasto pagado de la caja solo lo puede registrar el dueño del turno
      // (cash.store exige shift.cajeroId === actor), y el permiso lo tenía
      // únicamente el administrador de sucursal, que no es dueño de ese turno:
      // con los roles así, un gasto de caja no lo podía registrar nadie.
      'finance.read', 'finance.expenses.read', 'finance.expenses.create',
      'customers.read', 'customers.create',
      'kitchen.read',
      'reservations.read',
    ],
  },
  {
    codigo: 'MESERO',
    nombre: 'Mesero',
    descripcion: 'Toma pedidos en mesa y sigue su preparación, sin cobrar ni abrir caja.',
    permissions: [
      'catalog.read',
      'orders.read', 'orders.create', 'orders.manage',
      'tables.read', 'tables.manage',
      'kitchen.read',
      'customers.read', 'customers.create',
      'reservations.read', 'reservations.manage',
    ],
  },
  {
    codigo: 'COCINA',
    nombre: 'Cocina',
    descripcion: 'Trabaja las comandas en la pantalla de preparación.',
    permissions: [
      'kitchen.read', 'kitchen.manage',
      'orders.read',
      'catalog.read',
      'recipes.read',
    ],
  },
  {
    codigo: 'ALMACEN',
    nombre: 'Almacén',
    descripcion: 'Controla existencias, recepciones, traslados y producción de recetas.',
    permissions: [
      'catalog.read',
      'inventory.read', 'inventory.adjust', 'inventory.transfer', 'inventory.articles.manage',
      'inventory.units.manage', 'inventory.warehouses.manage', 'inventory.reports.read',
      'inventory.costs.read', 'inventory.consume.internal',
      'recipes.read', 'recipes.produce', 'recipes.production.read',
      'supply.request', 'supply.read', 'supply.send', 'supply.receive', 'supply.cancel',
      'purchases.read', 'purchases.suppliers.manage', 'purchases.presentations.manage',
      'purchases.orders.create', 'purchases.receipts.create', 'purchases.receipts.confirm',
      'media.read', 'media.upload',
    ],
  },
] as const;

/**
 * Reference units every installation needs: inventory articles, recipe
 * components and purchase presentations all point at one. Conversions are
 * stored once per pair — the resolver walks the graph in both directions.
 */
export const baseUnits = [
  { codigo: 'UND', nombre: 'Unidad', dimension: 'UNIDAD', esBase: true },
  { codigo: 'G', nombre: 'Gramo', dimension: 'MASA', esBase: true },
  { codigo: 'KG', nombre: 'Kilogramo', dimension: 'MASA', esBase: false },
  { codigo: 'LB', nombre: 'Libra', dimension: 'MASA', esBase: false },
  { codigo: 'OZ', nombre: 'Onza', dimension: 'MASA', esBase: false },
  { codigo: 'ML', nombre: 'Mililitro', dimension: 'VOLUMEN', esBase: true },
  { codigo: 'L', nombre: 'Litro', dimension: 'VOLUMEN', esBase: false },
  { codigo: 'CM', nombre: 'Centímetro', dimension: 'LONGITUD', esBase: true },
  { codigo: 'M', nombre: 'Metro', dimension: 'LONGITUD', esBase: false },
] as const;

/** [from, to, factor]: one `from` equals `factor` of `to`. */
export const unitConversions = [
  ['KG', 'G', '1000'],
  ['LB', 'G', '453.59237'],
  ['OZ', 'G', '28.349523125'],
  ['L', 'ML', '1000'],
  ['M', 'CM', '100'],
] as const;
