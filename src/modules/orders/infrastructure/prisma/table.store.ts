import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {audit,outbox,type Tx} from './order-shared.js';
import type {RoomDto,TableDto} from '../../presentation/http/dto/orders.dto.js';
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
  const occupied=await tx.ocupacionMesa.findFirst({where:{mesaId,cerradaEn:null}});
  if(occupied)return occupied;
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
}
