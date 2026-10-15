export type ValuationMethod = 'PROMEDIO_PONDERADO' | 'FIFO';
export type DeviceType =
  'POS' | 'KDS' | 'QUIOSCO' | 'PANTALLA_TURNOS' | 'IMPRESORA' | 'OTRO';
export interface Company {
  id: string;
  nombreComercial: string;
  razonSocial: string | null;
  nit: string | null;
  moneda: string;
  zonaHoraria: string;
  metodoValoracion: ValuationMethod;
  creadoEn: Date;
  actualizadoEn: Date;
}
export interface BranchConfig {
  sucursalId: string;
  horaCorteOperativo: string;
  exigeCobroAntesPreparar: boolean;
  permiteStockNegativo: boolean;
  permiteOrdenesQR: boolean;
  moneda: string;
  actualizadoEn: Date;
}
export interface Branch {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  zonaHoraria: string;
  activa: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
  configuracion: BranchConfig | null;
}
export interface Device {
  id: string;
  sucursalId: string;
  codigo: string;
  nombre: string;
  tipo: DeviceType;
  estacionPreparacionId: string | null;
  estacionNombre: string | null;
  ultimoAccesoEn: Date | null;
  activo: boolean;
  creadoEn: Date;
  sucursal: { id: string; codigo: string; nombre: string; activa: boolean };
}
export interface BranchAccess {
  id: string;
  codigo: string;
  nombre: string;
  zonaHoraria: string;
  roles: { codigo: string; nombre: string; alcance: 'GLOBAL' | 'SUCURSAL' }[];
}
export interface BranchOverview {
  sucursalId: string;
  usuariosAsignados: number;
  dispositivos: number;
  almacenes: number;
  cajas: number;
  estacionesPreparacion: number;
  ordenesAbiertas: number;
  turnosCajaAbiertos: number;
  entregasPendientes: number;
}
export interface Paged<T> {
  data: T[];
  total: number;
}
export interface ListFilter {
  search?: string;
  activo?: boolean;
  page: number;
  limit: number;
}
export interface DeviceFilter extends ListFilter {
  sucursalId?: string;
  tipo?: DeviceType;
}
export type CompanyChanges = Partial<
  Pick<
    Company,
    | 'nombreComercial'
    | 'razonSocial'
    | 'nit'
    | 'moneda'
    | 'zonaHoraria'
    | 'metodoValoracion'
  >
>;
export type BranchChanges = Partial<
  Pick<Branch, 'nombre' | 'direccion' | 'telefono' | 'zonaHoraria'>
>;
export type ConfigChanges = Partial<
  Pick<
    BranchConfig,
    | 'horaCorteOperativo'
    | 'exigeCobroAntesPreparar'
    | 'permiteStockNegativo'
    | 'permiteOrdenesQR'
    | 'moneda'
  >
>;
export type DeviceChanges = Partial<
  Pick<Device, 'nombre' | 'tipo' | 'estacionPreparacionId'>
>;
