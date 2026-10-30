import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {audit,outbox,type Tx} from './order-shared.js';
import type {RoomDto,TableDto,RoomUpdateDto,TableUpdateDto} from '../../presentation/http/dto/orders.dto.js';
@Injectable()
export class TableStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine){}
 async rooms(u:Principal,sucursalId:string){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'tables.read',sucursalId);
   return tx.sala.findMany({where:{sucursalId},include:{mesasComoSala:true},
    orderBy:[{orden:'asc'},{nombre:'asc'}]});
  });
 }
 async createRoom(u:Principal,d:RoomDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'tables.manage',d.sucursalId);
   const b=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!b?.activa)throw new ConflictException('Sucursal inactiva');
   if(await tx.sala.findFirst({where:{sucursalId:d.sucursalId,nombre:d.nombre.trim()}}))
    throw new ConflictException('Ya existe una sala con ese nombre');
   const row=await tx.sala.create({data:{sucursalId:d.sucursalId,nombre:d.nombre.trim()}});
   await audit(tx,u,'TABLE_ROOM_CREATED','Sala',row.id,d.sucursalId);
   return row;
  });
 }
 async list(u:Principal,sucursalId:string){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'tables.read',sucursalId);
   const rows=await tx.mesa.findMany({where:{sala:{sucursalId}},
    include:{sala:{select:{id:true,nombre:true}},ocupacionMesasComoMesa:{
     where:{cerradaEn:null},include:{ordenesComoOcupacionMesa:{
      select:{id:true,numero:true,estado:true,total:true,cerradaEn:true}}}}},orderBy:{numero:'asc'}});
   return rows.map(x=>({id:x.id,numero:x.numero,capacidad:x.capacidad,activa:x.activa,
    sala:x.sala,ocupacion:x.ocupacionMesasComoMesa[0]??null}));
  });
 }
 async createTable(u:Principal,d:TableDto){
  return this.engine.tx(async tx=>{
   const room=await tx.sala.findUnique({where:{id:d.salaId}});
   if(!room?.activa)throw new NotFoundException('Sala inexistente o inactiva');
   await this.engine.allowed(tx,u.id,'tables.manage',room.sucursalId);
   if(await tx.mesa.findFirst({where:{salaId:d.salaId,numero:d.numero.trim()}}))
    throw new ConflictException('Mesa ya registrada en esa sala');
   const row=await tx.mesa.create({data:{
    salaId:d.salaId,numero:d.numero.trim(),capacidad:d.capacidad}});
   await audit(tx,u,'TABLE_CREATED','Mesa',row.id,room.sucursalId);
   return row;
  });
 }
 async findOrOpen(tx:Tx,u:Principal,mesaId:string,branch:string){
  const table=await tx.mesa.findUnique({where:{id:mesaId},include:{sala:true}});
  if(!table||!table.activa||!table.sala.activa||table.sala.sucursalId!==branch)
   throw new ConflictException('Mesa inactiva o ajena a sucursal');
  // Use the same row lock as RSV-A check-in to prevent a walk-in race.
  await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesaId} FOR UPDATE`;
  const occupied=await tx.ocupacionMesa.findFirst({where:{mesaId,cerradaEn:null}});
  if(occupied)return occupied;
  const now=new Date();
  const reserved=await tx.reservaMesa.findFirst({where:{mesaId,reserva:{
   estado:{in:['PENDIENTE','CONFIRMADA']},inicio:{lte:now},fin:{gt:now}
  }},select:{reservaId:true}});
  if(reserved)throw new ConflictException('Mesa reservada en este horario; registre llegada de la reserva');
  const created=await tx.ocupacionMesa.create({data:{mesaId,abiertaPorId:u.id}});
  await audit(tx,u,'TABLE_OCCUPIED','OcupacionMesa',created.id,branch,{mesaId});
  await outbox(tx,'TABLE_OCCUPIED','Mesa',mesaId,branch,{ocupacionId:created.id});
  return created;
 }
 async close(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const row=await tx.ocupacionMesa.findUnique({where:{id},include:{mesa:{include:{sala:true}}}});
   if(!row)throw new NotFoundException('Ocupación inexistente');
   const branch=row.mesa.sala.sucursalId;
   await this.engine.allowed(tx,u.id,'tables.manage',branch);
   if(row.cerradaEn)return {id,cerrada:true};
   const active=await tx.orden.count({where:{ocupacionMesaId:id,estado:'ABIERTA'}});
   if(active)throw new ConflictException('Mesa con orden abierta: liquide o cancele la orden antes de cerrar');
   await tx.ocupacionMesa.update({where:{id},data:{cerradaEn:new Date()}});
   await audit(tx,u,'TABLE_RELEASED','OcupacionMesa',id,branch);
   await outbox(tx,'TABLE_RELEASED','Mesa',row.mesaId,branch);
   return {id,cerrada:true};
  });
 }
 async updateRoom(u:Principal,id:string,d:RoomUpdateDto){
  return this.engine.tx(async tx=>{
   const old=await tx.sala.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Sala inexistente');
   await this.engine.allowed(tx,u.id,'tables.manage',old.sucursalId);
   if(d.activa===false){
    const occupied=await tx.ocupacionMesa.count({where:{
     mesa:{salaId:id},cerradaEn:null
    }});
    if(occupied)throw new ConflictException('Sala con mesas ocupadas');
   }
   if(d.nombre&&await tx.sala.findFirst({where:{
    sucursalId:old.sucursalId,nombre:d.nombre.trim(),id:{not:id}
   }}))throw new ConflictException('Nombre de sala duplicado');
   const row=await tx.sala.update({where:{id},data:{
    ...(d.nombre!==undefined?{nombre:d.nombre.trim()}:{}),
    ...(d.activa!==undefined?{activa:d.activa}:{})
   }});
   await audit(tx,u,'TABLE_ROOM_UPDATED','Sala',id,old.sucursalId);
   return row;
  });
 }
 async updateTable(u:Principal,id:string,d:TableUpdateDto){
  return this.engine.tx(async tx=>{
   const old=await tx.mesa.findUnique({where:{id},include:{sala:true}});
   if(!old)throw new NotFoundException('Mesa inexistente');
   await this.engine.allowed(tx,u.id,'tables.manage',old.sala.sucursalId);
   if(d.activa===false&&await tx.ocupacionMesa.count({where:{mesaId:id,cerradaEn:null}}))
    throw new ConflictException('No puede desactivar mesa ocupada');
   if(d.numero&&await tx.mesa.findFirst({where:{
    salaId:old.salaId,numero:d.numero.trim(),id:{not:id}
   }}))throw new ConflictException('Número de mesa duplicado');
   const row=await tx.mesa.update({where:{id},data:{
    ...(d.numero!==undefined?{numero:d.numero.trim()}:{}),
    ...(d.capacidad!==undefined?{capacidad:d.capacidad}:{}),
    ...(d.activa!==undefined?{activa:d.activa}:{})
   }});
   await audit(tx,u,'TABLE_UPDATED','Mesa',id,old.sala.sucursalId);
   await outbox(tx,'TABLE_UPDATED','Mesa',id,old.sala.sucursalId);
   return row;
  });
 }

}
