import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service.js';
import {
  OrganizationRepositoryPort,
  type AccessScope,
} from '../../application/ports/organization.repository.port.js';
import { deviceStationPolicy } from '../../domain/organization.policy.js';
import type {
  Branch,
  BranchAccess,
  BranchChanges,
  BranchConfig,
  BranchOverview,
  CompanyChanges,
  ConfigChanges,
  Device,
  DeviceChanges,
  DeviceFilter,
  DeviceType,
  ListFilter,
} from '../../domain/organization.types.js';

type Tx = Prisma.TransactionClient;
const serial = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};
const branchInclude = { configuracionSucursalesComoSucursal: true } as const;
const deviceInclude = {
  sucursal: { select: { id: true, codigo: true, nombre: true, activa: true } },
  estacionPreparacion: { select: { nombre: true } },
} as const;

async function permission(
  tx: Tx,
  actorId: string,
  code: string,
  branchId: string | null,
): Promise<void> {
  const role = await tx.usuarioRol.findFirst({
    where: {
      usuarioId: actorId,
      usuario: { activo: true },
      rol: {
        activo: true,
        rolPermisosComoRol: { some: { permiso: { codigo: code } } },
      },
      OR: [
        {
          sucursalId: null,
          rol: {
            alcance: 'GLOBAL',
            activo: true,
            rolPermisosComoRol: { some: { permiso: { codigo: code } } },
          },
        },
        ...(branchId
          ? [
              {
                sucursalId: branchId,
                rol: {
                  alcance: 'SUCURSAL' as const,
                  activo: true,
                  rolPermisosComoRol: { some: { permiso: { codigo: code } } },
                },
              },
            ]
          : []),
      ],
    },
  });
  if (!role)
    throw new ForbiddenException('Permiso insuficiente para la operación');
}
async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entity: string,
  id: string,
  branchId: string | null,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<void> {
  await tx.eventoAuditoria.create({
    data: {
      usuarioId: actorId,
      accion: action,
      entidad: entity,
      entidadId: id,
      sucursalId: branchId,
      antes: before == null ? undefined : (before as Prisma.InputJsonValue),
      despues: after == null ? undefined : (after as Prisma.InputJsonValue),
      motivo: reason,
    },
  });
}
function normalizeError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
    throw new ConflictException(
      'El código ya existe o infringe una restricción única',
    );
  throw error;
}
function branchMap(row: {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  zonaHoraria: string;
  activa: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
  configuracionSucursalesComoSucursal: BranchConfigRow | null;
}): Branch {
  const c = row.configuracionSucursalesComoSucursal;
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    direccion: row.direccion,
    telefono: row.telefono,
    zonaHoraria: row.zonaHoraria,
    activa: row.activa,
    creadoEn: row.creadoEn,
    actualizadoEn: row.actualizadoEn,
    configuracion: c ? configMap(c) : null,
  };
}
type BranchConfigRow = {
  sucursalId: string;
  horaCorteOperativo: string;
  exigeCobroAntesPreparar: boolean;
  permiteStockNegativo: boolean;
  permiteOrdenesQR: boolean;
  moneda: string;
  actualizadoEn: Date;
};
function configMap(c: BranchConfigRow): BranchConfig {
  return {
    sucursalId: c.sucursalId,
    horaCorteOperativo: c.horaCorteOperativo,
    exigeCobroAntesPreparar: c.exigeCobroAntesPreparar,
    permiteStockNegativo: c.permiteStockNegativo,
    permiteOrdenesQR: c.permiteOrdenesQR,
    moneda: c.moneda,
    actualizadoEn: c.actualizadoEn,
  };
}
function deviceMap(row: {
  id: string;
  sucursalId: string;
  codigo: string;
  nombre: string;
  tipo: DeviceType;
  estacionPreparacionId: string | null;
  ultimoAccesoEn: Date | null;
  activo: boolean;
  creadoEn: Date;
  sucursal: { id: string; codigo: string; nombre: string; activa: boolean };
  estacionPreparacion: { nombre: string } | null;
}): Device {
  return {
    id: row.id,
    sucursalId: row.sucursalId,
    codigo: row.codigo,
    nombre: row.nombre,
    tipo: row.tipo,
    estacionPreparacionId: row.estacionPreparacionId,
    estacionNombre: row.estacionPreparacion?.nombre ?? null,
    ultimoAccesoEn: row.ultimoAccesoEn,
    activo: row.activo,
    creadoEn: row.creadoEn,
    sucursal: row.sucursal,
  };
}
function permitted(scope: AccessScope): Prisma.SucursalWhereInput {
  return scope.global ? {} : { id: { in: scope.branchIds } };
}
function permittedDevices(scope: AccessScope): Prisma.DispositivoWhereInput {
  return scope.global ? {} : { sucursalId: { in: scope.branchIds } };
}
async function stationRule(
  tx: Tx,
  sucursalId: string,
  tipo: DeviceType,
  stationId: string | null,
) {
  deviceStationPolicy(tipo, stationId);
  if (stationId) {
    const station = await tx.estacionPreparacion.findUnique({
      where: { id: stationId },
    });
    if (!station || station.sucursalId !== sucursalId || !station.activa)
      throw new ConflictException(
        'La estación debe estar activa y pertenecer a la misma sucursal',
      );
  }
}
async function ensureBranchActive(tx: Tx, id: string) {
  const row = await tx.sucursal.findUnique({ where: { id } });
  if (!row) throw new NotFoundException('Sucursal no encontrada');
  if (!row.activa) throw new ConflictException('La sucursal está desactivada');
  return row;
}
@Injectable()
export class PrismaOrganizationRepository extends OrganizationRepositoryPort {
  constructor(private readonly db: PrismaService) {
    super();
  }
  async company() {
    return this.db.empresaConfiguracion.findFirst({
      orderBy: { creadoEn: 'asc' },
    });
  }
  async updateCompany(actorId: string, changes: CompanyChanges) {
    return this.db.$transaction(async (tx) => {
      await permission(tx, actorId, 'organization.manage', null);
      const current = await tx.empresaConfiguracion.findFirst({
        orderBy: { creadoEn: 'asc' },
      });
      if (!current) throw new NotFoundException('Ejecute el seed inicial');
      const total = await tx.empresaConfiguracion.count();
      if (total !== 1)
        throw new ConflictException(
          'La empresa no cumple la regla de configuración única',
        );
      if (
        changes.metodoValoracion &&
        changes.metodoValoracion !== current.metodoValoracion
      ) {
        if (await tx.movimientoInventario.count())
          throw new ConflictException(
            'No se puede cambiar la valoración con movimientos existentes',
          );
      }
      if (changes.moneda && changes.moneda !== current.moneda) {
        const [sales, payments, financial, orders] = await Promise.all([
          tx.venta.count(),
          tx.pago.count(),
          tx.movimientoFinanciero.count(),
          tx.orden.count(),
        ]);
        if (sales + payments + financial + orders)
          throw new ConflictException(
            'No se puede cambiar la moneda base con transacciones monetarias',
          );
      }
      if (changes.zonaHoraria && changes.zonaHoraria !== current.zonaHoraria) {
        if (await tx.cierreOperativo.count())
          throw new ConflictException(
            'No se puede modificar la zona horaria con cierres existentes',
          );
      }
      const updated = await tx.empresaConfiguracion.update({
        where: { id: current.id },
        data: changes,
      });
      await audit(
        tx,
        actorId,
        'ORGANIZATION_UPDATED',
        'EmpresaConfiguracion',
        current.id,
        null,
        {
          nombreComercial: current.nombreComercial,
          razonSocial: current.razonSocial,
          nit: current.nit,
          moneda: current.moneda,
          zonaHoraria: current.zonaHoraria,
          metodoValoracion: current.metodoValoracion,
        },
        {
          nombreComercial: updated.nombreComercial,
          razonSocial: updated.razonSocial,
          nit: updated.nit,
          moneda: updated.moneda,
          zonaHoraria: updated.zonaHoraria,
          metodoValoracion: updated.metodoValoracion,
        },
      );
      return updated;
    }, serial);
  }
  async branchScope(userId: string, code: string): Promise<AccessScope> {
    const roles = await this.db.usuarioRol.findMany({
      where: {
        usuarioId: userId,
        usuario: { activo: true },
        rol: {
          activo: true,
          rolPermisosComoRol: { some: { permiso: { codigo: code } } },
        },
      },
      include: { rol: true },
    });
    return {
      global: roles.some(
        (r) => r.rol.alcance === 'GLOBAL' && r.sucursalId === null,
      ),
      branchIds: [
        ...new Set(
          roles
            .filter(
              (r) => r.rol.alcance === 'SUCURSAL' && r.sucursalId !== null,
            )
            .map((r) => r.sucursalId!),
        ),
      ],
    };
  }
  async myBranches(userId: string): Promise<BranchAccess[]> {
    const assigned = await this.db.usuarioRol.findMany({
      where: {
        usuarioId: userId,
        usuario: { activo: true },
        rol: { activo: true },
      },
      include: { rol: true },
    });
    const global = assigned.filter(
      (x) => x.rol.alcance === 'GLOBAL' && x.sucursalId === null,
    );
    const local = assigned.filter(
      (x) => x.rol.alcance === 'SUCURSAL' && x.sucursalId !== null,
    );
    const branches = await this.db.sucursal.findMany({
      where: {
        activa: true,
        ...(global.length
          ? {}
          : { id: { in: local.map((x) => x.sucursalId!) } }),
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    return branches.map((b) => ({
      id: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      zonaHoraria: b.zonaHoraria,
      roles: [
        ...new Map(
          [...global, ...local.filter((x) => x.sucursalId === b.id)].map(
            (r) => [
              r.rolId,
              {
                codigo: r.rol.codigo,
                nombre: r.rol.nombre,
                alcance: r.rol.alcance,
              },
            ],
          ),
        ).values(),
      ],
    }));
  }
  async listBranches(f: ListFilter, scope: AccessScope) {
    const where: Prisma.SucursalWhereInput = {
      ...permitted(scope),
      ...(f.activo === undefined ? {} : { activa: f.activo }),
      ...(f.search
        ? {
            OR: [
              { nombre: { contains: f.search, mode: 'insensitive' } },
              { codigo: { contains: f.search, mode: 'insensitive' } },
              { direccion: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.sucursal.findMany({
        where,
        include: branchInclude,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        skip: (f.page - 1) * f.limit,
        take: f.limit,
      }),
      this.db.sucursal.count({ where }),
    ]);
    return { data: rows.map(branchMap), total };
  }
  async branchOptions(
    f: { search?: string; cursor?: string; limit: number },
    scope: AccessScope,
  ) {
    const where: Prisma.SucursalWhereInput = {
      AND: [permitted(scope), ...(f.cursor ? [{ id: { gt: f.cursor } }] : [])],
      activa: true,
      ...(f.search
        ? {
            OR: [
              { nombre: { contains: f.search, mode: 'insensitive' } },
              { codigo: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.db.sucursal.findMany({
      where,
      orderBy: { id: 'asc' },
      take: f.limit + 1,
    });
    const more = rows.length > f.limit,
      sliced = rows.slice(0, f.limit);
    return {
      data: sliced.map((x) => ({
        id: x.id,
        label: x.nombre,
        codigo: x.codigo,
        zonaHoraria: x.zonaHoraria,
      })),
      nextCursor: more ? sliced[sliced.length - 1].id : null,
    };
  }
  async branch(id: string): Promise<Branch | null> {
    const row = await this.db.sucursal.findUnique({
      where: { id },
      include: branchInclude,
    });
    return row ? branchMap(row) : null;
  }
  async branchOverview(id: string): Promise<BranchOverview> {
    const [
      staff,
      devices,
      warehouses,
      cash,
      stations,
      orders,
      shifts,
      deliveries,
    ] = await Promise.all([
      this.db.usuario.count({
        where: {
          activo: true,
          usuarioRolesComoUsuario: {
            some: { sucursalId: id, rol: { activo: true } },
          },
        },
      }),
      this.db.dispositivo.count({ where: { sucursalId: id, activo: true } }),
      this.db.almacen.count({ where: { sucursalId: id, activo: true } }),
      this.db.caja.count({ where: { sucursalId: id, activa: true } }),
      this.db.estacionPreparacion.count({
        where: { sucursalId: id, activa: true },
      }),
      this.db.orden.count({ where: { sucursalId: id, estado: 'ABIERTA' } }),
      this.db.turnoCaja.count({
        where: { caja: { sucursalId: id }, cerradaEn: null },
      }),
      this.db.entrega.count({
        where: {
          orden: { sucursalId: id },
          estado: { in: ['PENDIENTE', 'EN_REPARTO'] },
        },
      }),
    ]);
    return {
      sucursalId: id,
      usuariosAsignados: staff,
      dispositivos: devices,
      almacenes: warehouses,
      cajas: cash,
      estacionesPreparacion: stations,
      ordenesAbiertas: orders,
      turnosCajaAbiertos: shifts,
      entregasPendientes: deliveries,
    };
  }
  async createBranch(
    actorId: string,
    input: {
      codigo: string;
      nombre: string;
      direccion?: string;
      telefono?: string;
      zonaHoraria?: string;
    },
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        await permission(tx, actorId, 'branches.manage', null);
        const company = await tx.empresaConfiguracion.findFirst();
        const row = await tx.sucursal.create({
          data: {
            ...input,
            configuracionSucursalesComoSucursal: {
              create: { moneda: company?.moneda ?? 'GTQ' },
            },
          },
          include: branchInclude,
        });
        await audit(
          tx,
          actorId,
          'BRANCH_CREATED',
          'Sucursal',
          row.id,
          row.id,
          null,
          { codigo: row.codigo, nombre: row.nombre },
        );
        return branchMap(row);
      }, serial);
    } catch (e) {
      normalizeError(e);
    }
  }
  async updateBranch(actorId: string, id: string, changes: BranchChanges) {
    return this.db.$transaction(async (tx) => {
      await permission(tx, actorId, 'branches.manage', id);
      const row = await tx.sucursal.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Sucursal no encontrada');
      const updated = await tx.sucursal.update({
        where: { id },
        data: changes,
        include: branchInclude,
      });
      await audit(
        tx,
        actorId,
        'BRANCH_UPDATED',
        'Sucursal',
        id,
        id,
        {
          nombre: row.nombre,
          direccion: row.direccion,
          telefono: row.telefono,
          zonaHoraria: row.zonaHoraria,
        },
        {
          nombre: updated.nombre,
          direccion: updated.direccion,
          telefono: updated.telefono,
          zonaHoraria: updated.zonaHoraria,
        },
      );
      return branchMap(updated);
    }, serial);
  }
  async changeBranchStatus(
    actorId: string,
    id: string,
    active: boolean,
    reason: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await permission(tx, actorId, 'branches.manage', id);
      const branch = await tx.sucursal.findUnique({ where: { id } });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
      if (branch.activa === active)
        return branchMap(
          await tx.sucursal.findUniqueOrThrow({
            where: { id },
            include: branchInclude,
          }),
        );
      if (!active) {
        const [
          orders,
          shifts,
          delivery,
          transfers,
          reservations,
          requisitions,
        ] = await Promise.all([
          tx.orden.count({ where: { sucursalId: id, estado: 'ABIERTA' } }),
          tx.turnoCaja.count({
            where: { caja: { sucursalId: id }, cerradaEn: null },
          }),
          tx.entrega.count({
            where: {
              orden: { sucursalId: id },
              estado: { in: ['PENDIENTE', 'EN_REPARTO'] },
            },
          }),
          tx.transferenciaInventario.count({
            where: {
              estado: 'EN_TRANSITO',
              OR: [
                { almacenOrigen: { sucursalId: id } },
                { almacenDestino: { sucursalId: id } },
              ],
            },
          }),
          tx.reserva.count({
            where: {
              sucursalId: id,
              estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
              inicio: { gte: new Date() },
            },
          }),
          tx.requisicion.count({
            where: { almacenDestino: { sucursalId: id }, estado: 'ABIERTA' },
          }),
        ]);
        if (
          orders +
          shifts +
          delivery +
          transfers +
          reservations +
          requisitions
        )
          throw new ConflictException(
            'La sucursal tiene órdenes, caja, entregas, transferencias, reservas o requisiciones pendientes',
          );
      }
      const updated = await tx.sucursal.update({
        where: { id },
        data: { activa: active },
        include: branchInclude,
      });
      await audit(
        tx,
        actorId,
        active ? 'BRANCH_ACTIVATED' : 'BRANCH_DEACTIVATED',
        'Sucursal',
        id,
        id,
        { activa: branch.activa },
        { activa: active },
        reason,
      );
      return branchMap(updated);
    }, serial);
  }
  async branchConfig(id: string): Promise<BranchConfig | null> {
    const config = await this.db.configuracionSucursal.findUnique({
      where: { sucursalId: id },
    });
    return config ? configMap(config) : null;
  }
  async updateBranchConfig(
    actorId: string,
    id: string,
    changes: ConfigChanges,
  ) {
    return this.db.$transaction(async (tx) => {
      await permission(tx, actorId, 'branches.manage', id);
      const branch = await tx.sucursal.findUnique({ where: { id } });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
      const before = await tx.configuracionSucursal.findUnique({
        where: { sucursalId: id },
      });
      if (changes.moneda && changes.moneda !== (before?.moneda ?? 'GTQ')) {
        const [orders, payments] = await Promise.all([
          tx.orden.count({ where: { sucursalId: id } }),
          tx.pago.count({ where: { cuenta: { orden: { sucursalId: id } } } }),
        ]);
        if (orders + payments)
          throw new ConflictException(
            'No se puede cambiar la moneda con órdenes o pagos existentes',
          );
      }
      if (
        changes.horaCorteOperativo &&
        changes.horaCorteOperativo !== (before?.horaCorteOperativo ?? '04:00')
      ) {
        if (await tx.cierreOperativo.count({ where: { sucursalId: id } }))
          throw new ConflictException(
            'No se puede cambiar el corte con cierres operativos existentes',
          );
      }
      const updated = await tx.configuracionSucursal.upsert({
        where: { sucursalId: id },
        create: { sucursalId: id, ...changes },
        update: changes,
      });
      await audit(
        tx,
        actorId,
        'BRANCH_CONFIG_UPDATED',
        'ConfiguracionSucursal',
        updated.id,
        id,
        before ? configMap(before) : null,
        configMap(updated),
      );
      return configMap(updated);
    }, serial);
  }
  async listDevices(f: DeviceFilter, scope: AccessScope) {
    const where: Prisma.DispositivoWhereInput = {
      AND: [
        permittedDevices(scope),
        ...(f.sucursalId ? [{ sucursalId: f.sucursalId }] : []),
      ],
      ...(f.activo === undefined ? {} : { activo: f.activo }),
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.search
        ? {
            OR: [
              { nombre: { contains: f.search, mode: 'insensitive' } },
              { codigo: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.dispositivo.findMany({
        where,
        include: deviceInclude,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: (f.page - 1) * f.limit,
        take: f.limit,
      }),
      this.db.dispositivo.count({ where }),
    ]);
    return { data: rows.map(deviceMap), total };
  }
  async deviceOptions(
    f: {
      search?: string;
      cursor?: string;
      limit: number;
      sucursalId?: string;
      tipo?: DeviceType;
    },
    scope: AccessScope,
  ) {
    const where: Prisma.DispositivoWhereInput = {
      AND: [
        permittedDevices(scope),
        ...(f.sucursalId ? [{ sucursalId: f.sucursalId }] : []),
        ...(f.cursor ? [{ id: { gt: f.cursor } }] : []),
      ],
      activo: true,
      sucursal: { activa: true },
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.search
        ? {
            OR: [
              { nombre: { contains: f.search, mode: 'insensitive' } },
              { codigo: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.db.dispositivo.findMany({
      where,
      orderBy: { id: 'asc' },
      take: f.limit + 1,
    });
    const sliced = rows.slice(0, f.limit),
      more = rows.length > f.limit;
    return {
      data: sliced.map((x) => ({
        id: x.id,
        label: x.nombre,
        codigo: x.codigo,
        tipo: x.tipo,
        sucursalId: x.sucursalId,
      })),
      nextCursor: more ? sliced[sliced.length - 1].id : null,
    };
  }
  async device(id: string): Promise<Device | null> {
    const row = await this.db.dispositivo.findUnique({
      where: { id },
      include: deviceInclude,
    });
    return row ? deviceMap(row) : null;
  }
  async createDevice(
    actorId: string,
    input: {
      sucursalId: string;
      codigo: string;
      nombre: string;
      tipo: DeviceType;
      estacionPreparacionId?: string | null;
    },
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        await permission(tx, actorId, 'devices.manage', input.sucursalId);
        await ensureBranchActive(tx, input.sucursalId);
        await stationRule(
          tx,
          input.sucursalId,
          input.tipo,
          input.estacionPreparacionId ?? null,
        );
        const row = await tx.dispositivo.create({
          data: input,
          include: deviceInclude,
        });
        await audit(
          tx,
          actorId,
          'DEVICE_CREATED',
          'Dispositivo',
          row.id,
          row.sucursalId,
          null,
          { codigo: row.codigo, tipo: row.tipo, nombre: row.nombre },
        );
        return deviceMap(row);
      }, serial);
    } catch (e) {
      normalizeError(e);
    }
  }
  async updateDevice(actorId: string, id: string, changes: DeviceChanges) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.dispositivo.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Dispositivo no encontrado');
      await permission(tx, actorId, 'devices.manage', current.sucursalId);
      await ensureBranchActive(tx, current.sucursalId);
      const type = changes.tipo ?? current.tipo;
      const station =
        changes.estacionPreparacionId === undefined
          ? current.estacionPreparacionId
          : changes.estacionPreparacionId;
      await stationRule(tx, current.sucursalId, type, station);
      const updated = await tx.dispositivo.update({
        where: { id },
        data: changes,
        include: deviceInclude,
      });
      await audit(
        tx,
        actorId,
        'DEVICE_UPDATED',
        'Dispositivo',
        id,
        current.sucursalId,
        {
          nombre: current.nombre,
          tipo: current.tipo,
          estacionPreparacionId: current.estacionPreparacionId,
        },
        {
          nombre: updated.nombre,
          tipo: updated.tipo,
          estacionPreparacionId: updated.estacionPreparacionId,
        },
      );
      return deviceMap(updated);
    }, serial);
  }
  async changeDeviceStatus(
    actorId: string,
    id: string,
    active: boolean,
    reason: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.dispositivo.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Dispositivo no encontrado');
      await permission(tx, actorId, 'devices.manage', current.sucursalId);
      if (active) await ensureBranchActive(tx, current.sucursalId);
      if (current.activo === active)
        return deviceMap(
          await tx.dispositivo.findUniqueOrThrow({
            where: { id },
            include: deviceInclude,
          }),
        );
      const updated = await tx.dispositivo.update({
        where: { id },
        data: { activo: active },
        include: deviceInclude,
      });
      await audit(
        tx,
        actorId,
        active ? 'DEVICE_ACTIVATED' : 'DEVICE_DEACTIVATED',
        'Dispositivo',
        id,
        current.sucursalId,
        { activo: current.activo },
        { activo: active },
        reason,
      );
      return deviceMap(updated);
    }, serial);
  }
}
