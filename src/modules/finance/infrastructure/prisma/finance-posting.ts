import {ConflictException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {customerCreditAllowed,type FinancialSource} from '../../domain/ledger.policy.js';

export type FinancialTx=Prisma.TransactionClient;
export type {FinancialSource} from '../../domain/ledger.policy.js';
export const SOURCE_KIND={
 PAYMENT:'PAGO',REFUND:'REEMBOLSO_PAGO',SUPPLIER_PAYMENT:'PAGO_PROVEEDOR'
} as const;

export async function postVerifiedExternalMovement(tx:FinancialTx,input:{
 sucursalId:string;cuentaId:string;referenciaTipo:FinancialSource;
 referenciaId:string;monto:Prisma.Decimal;descripcion:string
}){
 if(input.monto.eq(0))throw new ConflictException('Movimiento financiero no puede ser cero');
 const [branch,account,existing]=await Promise.all([
  tx.sucursal.findUnique({where:{id:input.sucursalId},
   include:{configuracionSucursalesComoSucursal:true}}),
  tx.cuentaFinanciera.findUnique({where:{id:input.cuentaId}}),
  tx.movimientoFinanciero.findFirst({where:{
   referenciaTipo:input.referenciaTipo,referenciaId:input.referenciaId}})
 ]);
 if(!branch?.activa||!account?.activa||account.sucursalId!==input.sucursalId)
  throw new ConflictException('Cuenta financiera no disponible en esta sucursal');
 if(account.moneda!==(branch.configuracionSucursalesComoSucursal?.moneda??'GTQ'))
  throw new ConflictException('Moneda financiera incompatible con la sucursal');
 if(!customerCreditAllowed(input.referenciaTipo,account.tipo))
  throw new ConflictException('Cuenta de tarjeta empresarial no admite cobros de clientes');
 if(existing){
  if(existing.cuentaId!==input.cuentaId||!existing.monto.eq(input.monto))
   throw new ConflictException('Origen ya registrado con cuenta o importe distinto');
  return {id:existing.id,created:false,cuentaId:existing.cuentaId,monto:existing.monto.toFixed(2)};
 }
 const row=await tx.movimientoFinanciero.create({data:{
  cuentaId:input.cuentaId,monto:input.monto,
  referenciaTipo:input.referenciaTipo,referenciaId:input.referenciaId,
  descripcion:input.descripcion
 }});
 return {id:row.id,created:true,cuentaId:row.cuentaId,monto:row.monto.toFixed(2)};
}
