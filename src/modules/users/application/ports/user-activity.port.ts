export interface DateRange {
  from: Date;
  to: Date;
  sucursalId: string | null;
}
export interface ActivityItem {
  id: string;
  kind: 'ORDEN' | 'PAGO' | 'CAJA' | 'ENTREGA' | 'INVENTARIO';
  at: string;
  label: string;
  status: string | null;
  amount: string | null;
  sucursalId: string | null;
}
export interface StaffOverview {
  desde: string;
  hasta: string;
  sucursalId: string | null;
  ordenes: { total: number; cerradas: number; importeOrdenes: string };
  cobros: { cantidad: number; importeCobrado: string };
  caja: { turnos: number; abiertos: number };
  delivery: { entregas: number; completadas: number };
  inventario: { movimientos: number };
}
export abstract class UserActivityPort {
  abstract overview(userId: string, range: DateRange): Promise<StaffOverview>;
  abstract activity(
    userId: string,
    range: DateRange,
    input: { page: number; limit: number; kind?: ActivityItem['kind'] },
  ): Promise<{
    data: ActivityItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>;
  abstract report(
    range: DateRange,
    input: { page: number; limit: number },
  ): Promise<{
    data: Array<{
      usuarioId: string;
      nombre: string;
      ordenes: number;
      cobros: number;
      importeCobrado: string;
    }>;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>;
}
