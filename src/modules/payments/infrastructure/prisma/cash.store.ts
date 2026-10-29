
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {money,formatted,operationalDate,assertShiftOperationalDate} from '../../domain/payment.policy.js';
import {allowed,audit,runOnce,txSerializable,type Tx} from './payment-shared.js';
import {assertFinancialPeriodOpen} from '../../../finance/infrastructure/prisma/finance-period.guard.js';
import type {RegisterDto,RegisterPatchDto,ShiftOpenDto,ShiftCloseDto,ShiftMovementDto,PageDto} from '../../presentation/http/dto/payments.dto.js';
@Injectable()
export class CashStore{
 constructor(private readonly db:PrismaService){}
 private async cash(tx:Tx,id:string){
  const r=await tx.caja.findUnique({where:{id},include:{sucursal:{include:{configuracionSucursalesComoSucursal:true}}}});
  if(!r)throw new NotFoundException('Caja inexistente');
  if(!r.activa||!r.sucursal.activa)throw new ConflictException('Caja o sucursal inactiva');
  return r;
 }
 async registers(u:Principal,sucursalId:string){
  return txSerializable(this.db,async tx=>{
   await allowed(tx,u,sucursalId,'cash.read');
   return tx.caja.findMany({where:{sucursalId},orderBy:{codigo:'asc'}});
  });
 }
 async create(u:Principal,d:RegisterDto){
  return txSerializable(this.db,async tx=>{
   await allowed(tx,u,d.sucursalId,'cash.manage');
   const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!branch?.activa)throw new ConflictException('Sucursal inactiva');
   const codigo=d.codigo.trim().toUpperCase();
   if(!/^[A-Z0-9_-]{2,40}$/.test(codigo))throw new BadRequestException('Código de caja inválido');
   const row=await tx.caja.create({data:{sucursalId:d.sucursalId,codigo,nombre:d.nombre.trim()}});
   await audit(tx,u,d.sucursalId,'CASH_REGISTER_CREATED','Caja',row.id);
   return row;
  });
 }
 async update(u:Principal,id:string,d:RegisterPatchDto){
  return txSerializable(this.db,async tx=>{
   const row=await tx.caja.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Caja inexistente');
   await allowed(tx,u,row.sucursalId,'cash.manage');
   if(d.activa===false&&await tx.turnoCaja.count({where:{cajaId:id,cerradaEn:null}}))
    throw new ConflictException('Caja con turno abierto');
   if(d.nombre===undefined&&d.activa===undefined)throw new BadRequestException('Sin cambios');
   const updated=await tx.caja.update({where:{id},data:{
    ...(d.nombre!==undefined?{nombre:d.nombre.trim()}:{}),
    ...(d.activa!==undefined?{activa:d.activa}:{})}});
   await audit(tx,u,row.sucursalId,'CASH_REGISTER_UPDATED','Caja',id);
   return updated;
  });
 }
 async open(u:Principal,d:ShiftOpenDto){
  const initial=money(d.fondoInicial,true);
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,'CASH_SHIFT_OPEN',d,async()=>{
   const register=await this.cash(tx,d.cajaId);
   await allowed(tx,u,register.sucursalId,'cash.open');
   if(await tx.turnoCaja.findFirst({where:{OR:[{cajaId:d.cajaId},{cajeroId:u.id}],cerradaEn:null}}))
    throw new ConflictException('Caja o cajero ya tiene turno abierto');
   const fechaOperativa=await assertFinancialPeriodOpen(tx,register.sucursal);
   const shift=await tx.turnoCaja.create({data:{cajaId:d.cajaId,cajeroId:u.id,
    fechaOperativa,
    fondoInicial:initial}});
   await audit(tx,u,register.sucursalId,'CASH_SHIFT_OPENED','TurnoCaja',shift.id);
   return {shiftId:shift.id};
  }));
 }
 async shiftTx(tx:Tx,u:Principal,id:string,permission:string,requireOwner=true,
  allowPreviousDayForClosing=false){
  const shift=await tx.turnoCaja.findUnique({where:{id},include:{caja:{include:{
   sucursal:{include:{configuracionSucursalesComoSucursal:true}}
  }}}});
  if(!shift)throw new NotFoundException('Turno inexistente');
  await allowed(tx,u,shift.caja.sucursalId,permission);
  if(shift.cerradaEn)throw new ConflictException('Turno cerrado');
  if(requireOwner&&shift.cajeroId!==u.id)throw new ConflictException('Turno de otro cajero');
  if(!shift.caja.activa)throw new ConflictException('Caja inactiva');
  if(!allowPreviousDayForClosing){
   assertShiftOperationalDate(shift.fechaOperativa,new Date(),shift.caja.sucursal.zonaHoraria,
    shift.caja.sucursal.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00');
   await assertFinancialPeriodOpen(tx,shift.caja.sucursal);
  }
  return shift;
 }
 async detail(u:Principal,id:string){
  return txSerializable(this.db,async tx=>{
   const shift=await tx.turnoCaja.findUnique({where:{id},include:{
    caja:true,arqueoCajasComoTurno:true,
    movimientoCajasComoTurno:{orderBy:{creadoEn:'asc'}}}});
   if(!shift)throw new NotFoundException('Turno inexistente');
   await allowed(tx,u,shift.caja.sucursalId,'cash.read');
   const movements=shift.movimientoCajasComoTurno.reduce((v,m)=>v.plus(
    m.tipo==='INGRESO'?m.monto:m.monto.neg()),shift.fondoInicial);
   return {...shift,efectivoCalculado:formatted(movements)};
  });
 }
 async list(u:Principal,q:PageDto){
  return txSerializable(this.db,async tx=>{
   await allowed(tx,u,q.sucursalId,'cash.read');
   const where={caja:{sucursalId:q.sucursalId}};
   const [data,total]=await Promise.all([
    tx.turnoCaja.findMany({where,include:{caja:true},orderBy:{abiertaEn:'desc'},
     skip:(q.page-1)*q.limit,take:q.limit}),tx.turnoCaja.count({where})]);
   return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async movement(u:Principal,id:string,d:ShiftMovementDto){
  const value=money(d.monto);
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,'CASH_MANUAL_MOVEMENT',{id,...d},async()=>{
   const shift=await this.shiftTx(tx,u,id,'cash.manage');
   if(d.tipo==='EGRESO'){
    const moves=await tx.movimientoCaja.findMany({where:{turnoId:id}});
    const available=moves.reduce((s,m)=>s.plus(m.tipo==='INGRESO'?m.monto:m.monto.neg()),shift.fondoInicial);
    if(value.gt(available))throw new ConflictException('Efectivo insuficiente en caja');
   }
   const m=await tx.movimientoCaja.create({data:{turnoId:id,tipo:d.tipo,monto:value,
    motivo:d.motivo.trim(),usuarioId:u.id}});
   await audit(tx,u,shift.caja.sucursalId,'CASH_MOVEMENT_CREATED','MovimientoCaja',m.id);
   return {movementId:m.id};
  }));
 }
 async close(u:Principal,id:string,d:ShiftCloseDto){
  const counted=money(d.efectivoContado,true);
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,'CASH_SHIFT_CLOSE',{id,...d},async()=>{
   const shift=await this.shiftTx(tx,u,id,'cash.close',false,true);
   const moves=await tx.movimientoCaja.findMany({where:{turnoId:id}});
   const expected=moves.reduce((v,m)=>v.plus(m.tipo==='INGRESO'?m.monto:m.monto.neg()),shift.fondoInicial);
   const difference=counted.minus(expected);
   const now=new Date();
   await tx.arqueoCaja.create({data:{turnoId:id,contado:counted,esperado:expected,
    diferencia:difference,realizadoPorId:u.id,nota:d.notaCierre?.trim()}});
   await tx.turnoCaja.update({where:{id},data:{efectivoEsperado:expected,
    efectivoContado:counted,diferencia:difference,cerradaEn:now,notaCierre:d.notaCierre?.trim()}});
   await audit(tx,u,shift.caja.sucursalId,'CASH_SHIFT_CLOSED','TurnoCaja',id,{
    esperado:formatted(expected),contado:formatted(counted),diferencia:formatted(difference)});
   return {shiftId:id,efectivoEsperado:formatted(expected),efectivoContado:formatted(counted),
    diferencia:formatted(difference)};
  }));
 }
}
