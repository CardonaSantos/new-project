import {ConflictException} from '@nestjs/common';
import type {Prisma} from '../../../../generated/prisma/client.js';
import {operationalDate} from '../../../payments/domain/payment.policy.js';

/**
 * Shared SERIALIZABLE transaction guard for all writes affecting today's
 * cash or financial ledger. Does not lock historical bank statement matching.
 * Call before the first monetary write in the same transaction.
 */
export async function assertFinancialPeriodOpen(
 tx:Prisma.TransactionClient,
 branch:{id:string;zonaHoraria:string;configuracionSucursalesComoSucursal?:{horaCorteOperativo:string}|null},
 now:Date=new Date()
){
 const fechaOperativa=operationalDate(now,branch.zonaHoraria,
  branch.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00');
 const closed=await tx.cierreOperativo.findUnique({where:{sucursalId_fechaOperativa:{
  sucursalId:branch.id,fechaOperativa
 }}});
 if(closed)throw new ConflictException('Día operativo cerrado; no admite nuevos movimientos');
 return fechaOperativa;
}
