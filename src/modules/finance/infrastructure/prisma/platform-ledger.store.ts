import {Injectable} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {PlatformLedgerPort} from '../../application/ports/platform-ledger.port.js';
import {postVerifiedExternalMovement} from './finance-posting.js';
import {allowed} from '../../../payments/infrastructure/prisma/payment-shared.js';

@Injectable()
export class PlatformLedgerStore extends PlatformLedgerPort{
 async postNetInTx(transaction:unknown,u:Principal,input:{
  sucursalId:string;cuentaFinancieraId:string;liquidacionId:string;monto:string
 }){
  const tx=transaction as Prisma.TransactionClient;
  await allowed(tx,u,input.sucursalId,'finance.movements.post');
  const result=await postVerifiedExternalMovement(tx,{
   sucursalId:input.sucursalId,cuentaId:input.cuentaFinancieraId,
   referenciaTipo:'LIQUIDACION_CANAL',referenciaId:input.liquidacionId,
   monto:new Prisma.Decimal(input.monto),descripcion:'Liquidación neta verificada de plataforma'
  });
  return {movimientoId:result.id,cuentaFinancieraId:result.cuentaId,monto:result.monto};
 }
}
