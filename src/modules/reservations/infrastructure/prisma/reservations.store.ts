import {createHash} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ReservationsPort} from '../../application/ports/reservations.port.js';
import type {AvailabilityDto,ReservationCreateDto,ReservationListDto,ReservationUpdateDto,ReservationReasonDto} from '../../presentation/http/dto/reservations.dto.js';
import {checkInWindow,noShowWindow,requireEditable,validateCapacity,validateWindow} from '../../domain/reservation.policy.js';

type Tx=Prisma.TransactionClient;
const active=['PENDIENTE','CONFIRMADA'] as const;
const details={
 sucursal:{select:{id:true,codigo:true,nombre:true,zonaHoraria:true,direccion:true}},
 cliente:{select:{id:true,nombre:true,telefono:true,email:true,activo:true}},
 creadaPor:{select:{id:true,nombre:true}},
 reservaMesasComoReserva:{include:{mesa:{include:{sala:{select:{id:true,nombre:true,sucursalId:true}}}}}},
 ocupacionMesasComoReserva:{include:{
  mesa:{include:{sala:{select:{id:true,nombre:true}}}},
  abiertaPor:{select:{id:true,nombre:true}},
  ordenesComoOcupacionMesa:{select:{id:true,numero:true,estado:true,total:true,cerradaEn:true}}
 }},
 eventoReservasComoReserva:{orderBy:[{creadoEn:'asc' as const},{id:'asc' as const}],
  include:{usuario:{select:{id:true,nombre:true}}}}
} satisfies Prisma.ReservaInclude;
type ReservationDetail=Prisma.ReservaGetPayload<{include:typeof details}>;
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

@Injectable()
export class ReservationsStore extends ReservationsPort{
 constructor(private readonly db:PrismaService){super();}
 private async tx<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let i=0;i<3;i++)try{
   return await this.db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});
  }catch(e){
   if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
    if(i<2)continue;
    throw new ConflictException('Conflicto concurrente; actualice la disponibilidad');
   }
   throw e;
  }
  throw new ConflictException('No fue posible confirmar la reservación');
 }
 private async has(tx:Tx,u:Principal,branch:string,perm:string){
  return !!await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:perm}}}}},
   {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:perm}}}}}
  ]},select:{id:true}});
 }
 private async authorize(tx:Tx,u:Principal,branch:string,manage=false){
  const permitted=await this.has(tx,u,branch,'reservations.manage')||
   (!manage&&await this.has(tx,u,branch,'reservations.read'));
  if(!permitted)throw new ForbiddenException('Sin permiso de reservaciones en esta sucursal');
 }
 private async branch(tx:Tx,id:string){
  const b=await tx.sucursal.findUnique({where:{id},select:{id:true,activa:true,zonaHoraria:true}});
  if(!b?.activa)throw new NotFoundException('Sucursal no disponible');
  return b;
 }
 private async customer(tx:Tx,branch:string,id:string|null|undefined){
  if(!id)return;
  const row=await tx.cliente.findFirst({where:{id,activo:true,
   clienteSucursalesComoCliente:{some:{sucursalId:branch}}},select:{id:true}});
  if(!row)throw new ConflictException('Cliente inactivo o no vinculado a la sucursal');
 }
 private async lockTables(tx:Tx,ids:string[]){
  for(const id of [...new Set(ids)].sort()){
   await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${id} FOR UPDATE`;
  }
 }
 private async availableTables(tx:Tx,branch:string,start:Date,end:Date){
  const tables=await tx.mesa.findMany({where:{activa:true,sala:{sucursalId:branch,activa:true}},
   include:{sala:{select:{id:true,nombre:true}}},orderBy:[{capacidad:'asc'},{numero:'asc'}]});
  const ids=tables.map(t=>t.id);
  const [reserved,occupied]=await Promise.all([
   tx.reservaMesa.findMany({where:{mesaId:{in:ids},reserva:{
    estado:{in:[...active]},inicio:{lt:end},fin:{gt:start}}},
    select:{mesaId:true,reserva:{select:{id:true,inicio:true,fin:true,estado:true}}}}),
   tx.ocupacionMesa.findMany({where:{mesaId:{in:ids},cerradaEn:null},
    select:{id:true,mesaId:true,reservaId:true,abiertaEn:true}})
  ]);
  // Current occupancy is a blocker near NOW; it is not assumed to last indefinitely.
  const nearStart=start.getTime()<=Date.now()+30*60000;
  const busyReservations=new Map(reserved.map(x=>[x.mesaId,x.reserva]));
  const busyOccupancies=new Map(nearStart?occupied.map(x=>[x.mesaId,x]):[]);
  return tables.map(t=>({
   id:t.id,numero:t.numero,capacidad:t.capacidad,sala:t.sala,
   disponible:!busyReservations.has(t.id)&&!busyOccupancies.has(t.id),
   motivo:busyReservations.has(t.id)?'RESERVADA':busyOccupancies.has(t.id)?'OCUPADA':null,
   reservaConflictoId:busyReservations.get(t.id)?.id??null,
   ocupacionId:busyOccupancies.get(t.id)?.id??null
  }));
 }
 private async assertTables(tx:Tx,branch:string,ids:string[],persons:number,start:Date,end:Date,ignore?:string){
  if(!ids.length||ids.length>15||new Set(ids).size!==ids.length)
   throw new BadRequestException('Indique entre 1 y 15 mesas distintas');
  await this.lockTables(tx,ids);
  const tables=await tx.mesa.findMany({where:{id:{in:ids},activa:true,sala:{sucursalId:branch,activa:true}},
   select:{id:true,capacidad:true}});
  if(tables.length!==ids.length)throw new ConflictException('Mesa inactiva o ajena a esta sucursal');
  validateCapacity(tables.map(t=>t.capacidad),persons);
  const collisions=await tx.reservaMesa.findMany({where:{mesaId:{in:ids},reserva:{
   estado:{in:[...active]},inicio:{lt:end},fin:{gt:start},
   ...(ignore?{id:{not:ignore}}:{})
  }},select:{mesaId:true}});
  if(collisions.length)throw new ConflictException('Una o más mesas ya están reservadas para el horario');
  if(start.getTime()<=Date.now()+30*60000){
   if(await tx.ocupacionMesa.count({where:{mesaId:{in:ids},cerradaEn:null}}))
    throw new ConflictException('Una o más mesas están ocupadas');
  }
 }
 private async automaticTable(tx:Tx,branch:string,persons:number,start:Date,end:Date,ignore?:string){
  const candidates=(await this.availableTables(tx,branch,start,end))
   .filter(x=>x.disponible&&x.capacidad>=persons);
  for(const c of candidates){
   try{await this.assertTables(tx,branch,[c.id],persons,start,end,ignore);return [c.id];}
   catch(e){if(!(e instanceof ConflictException))throw e;}
  }
  throw new ConflictException('No hay una mesa libre con capacidad suficiente; seleccione mesas manualmente');
 }
 private async event(tx:Tx,u:Principal,id:string,branch:string,action:string,detail?:string){
  await tx.eventoReserva.create({data:{reservaId:id,usuarioId:u.id,accion:action,detalle:detail}});
  await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:branch,accion:action,
   entidad:'Reserva',entidadId:id}});
  // No email/SMS, provider attempts, or notification event is generated.
  await tx.eventoOutbox.create({data:{tipo:action,agregado:'Reserva',agregadoId:id,
   payload:{sucursalId:branch,estadoAccion:action} as Prisma.InputJsonValue}});
 }
 private async row(tx:Tx,id:string){
  const data=await tx.reserva.findUnique({where:{id}});
  if(!data)throw new NotFoundException('Reservación inexistente');
  return data;
 }
 private async lockReservation(tx:Tx,id:string){
  await tx.$queryRaw`SELECT "id" FROM "Reserva" WHERE "id" = ${id} FOR UPDATE`;
  return this.row(tx,id);
 }
 private output(r:ReservationDetail){
  const tables=r.reservaMesasComoReserva.map(x=>({
   id:x.mesa.id,numero:x.mesa.numero,capacidad:x.mesa.capacidad,activa:x.mesa.activa,
   sala:x.mesa.sala
  }));
  return {id:r.id,sucursalId:r.sucursalId,sucursal:r.sucursal,clienteId:r.clienteId,
   cliente:r.cliente,nombreContacto:r.nombreContacto,telefonoContacto:r.telefonoContacto,
   emailContacto:r.emailContacto,personas:r.personas,inicio:r.inicio,fin:r.fin,
   estado:r.estado,notas:r.notas,creadaEn:r.creadaEn,creadaPor:r.creadaPor,
   mesas:tables,capacidadAsignada:tables.reduce((s,t)=>s+t.capacidad,0),
   ocupaciones:r.ocupacionMesasComoReserva.map(o=>({
    id:o.id,mesaId:o.mesaId,mesa:{id:o.mesa.id,numero:o.mesa.numero,sala:o.mesa.sala},
    abiertaEn:o.abiertaEn,cerradaEn:o.cerradaEn,abiertaPor:o.abiertaPor,
    ordenes:o.ordenesComoOcupacionMesa
   })),
   eventos:r.eventoReservasComoReserva.map(e=>({
    id:e.id,accion:e.accion,detalle:e.detalle,creadoEn:e.creadoEn,actor:e.usuario
   }))
  };
 }
 private async enriched(tx:Tx,id:string){
  const data=await tx.reserva.findUnique({where:{id},include:details});
  if(!data)throw new NotFoundException('Reservación inexistente');
  return this.output(data);
 }
 async availability(u:Principal,q:AvailabilityDto){
  const {inicio,fin}=validateWindow(q.inicio,q.fin);
  return this.tx(async tx=>{
   await this.authorize(tx,u,q.sucursalId);
   await this.branch(tx,q.sucursalId);
   const tables=await this.availableTables(tx,q.sucursalId,inicio,fin);
   const suggestions=tables.filter(t=>t.disponible&&t.capacidad>=q.personas)
    .sort((a,b)=>a.capacidad-b.capacidad||a.numero.localeCompare(b.numero));
   return {sucursalId:q.sucursalId,inicio,fin,personas:q.personas,
    mesas:tables,sugerencias:suggestions.map(t=>t.id),
    totalDisponibles:tables.filter(t=>t.disponible).length};
  });
 }
 async list(u:Principal,q:ReservationListDto){
  return this.tx(async tx=>{
   await this.authorize(tx,u,q.sucursalId);
   await this.branch(tx,q.sucursalId);
   if(q.desde&&q.hasta&&new Date(q.desde)>new Date(q.hasta))
    throw new BadRequestException('Rango de fechas invertido');
   const search=q.search?.trim();
   const where:Prisma.ReservaWhereInput={sucursalId:q.sucursalId,
    ...(q.estado?{estado:q.estado}:{}),
    ...(q.desde?{inicio:{gte:new Date(q.desde)}}:{}),
    ...(q.hasta?{fin:{lte:new Date(q.hasta)}}:{}),
    ...(search?{OR:[{nombreContacto:{contains:search,mode:'insensitive'}},
     {telefonoContacto:{contains:search}},{cliente:{nombre:{contains:search,mode:'insensitive'}}}]}:{})
   };
   const [rows,total]=await Promise.all([
    tx.reserva.findMany({where,include:details,orderBy:[{inicio:'asc'},{id:'asc'}],
     skip:(q.page-1)*q.limit,take:q.limit}),tx.reserva.count({where})
   ]);
   return {data:rows.map(x=>this.output(x)),meta:{page:q.page,limit:q.limit,total,
    totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async detail(u:Principal,id:string){
  return this.tx(async tx=>{
   const r=await this.row(tx,id);
   await this.authorize(tx,u,r.sucursalId);
   return this.enriched(tx,id);
  });
 }
 async create(u:Principal,d:ReservationCreateDto){
  const {inicio,fin}=validateWindow(d.inicio,d.fin);
  const id=await this.tx(async tx=>{
   await this.authorize(tx,u,d.sucursalId,true);
   await this.branch(tx,d.sucursalId);
   await this.customer(tx,d.sucursalId,d.clienteId);
   const operation='RSV:'+u.id+':'+d.claveOperacion;
   const digest=hash({actor:u.id,operation:'RESERVATION_CREATE',request:d});
   const previous=await tx.operacionIdempotente.findUnique({where:{clave:operation}});
   if(previous){
    if(previous.hashSolicitud!==digest||previous.operacion!=='RESERVATION_CREATE'||
       !previous.finalizada||!previous.resultado)
     throw new ConflictException('Clave de operación reutilizada con otros datos');
    return (previous.resultado as {id:string}).id;
   }
   const tableIds=d.mesaIds?.length?d.mesaIds:
    await this.automaticTable(tx,d.sucursalId,d.personas,inicio,fin);
   await this.assertTables(tx,d.sucursalId,tableIds,d.personas,inicio,fin);
   const r=await tx.reserva.create({data:{
    sucursalId:d.sucursalId,clienteId:d.clienteId??null,
    nombreContacto:d.nombreContacto.trim(),telefonoContacto:d.telefonoContacto?.trim()||null,
    emailContacto:d.emailContacto?.trim()||null,personas:d.personas,
    inicio,fin,estado:d.estadoInicial??'CONFIRMADA',notas:d.notas?.trim()||null,creadaPorId:u.id,
    reservaMesasComoReserva:{create:tableIds.map(mesaId=>({mesaId}))}
   }});
   await this.event(tx,u,r.id,d.sucursalId,'RESERVATION_CREATED');
   await tx.operacionIdempotente.create({data:{clave:operation,operacion:'RESERVATION_CREATE',
    hashSolicitud:digest,resultado:{id:r.id},finalizada:true,expiraEn:new Date(Date.now()+90*86400000)}});
   return r.id;
  });
  return this.detail(u,id);
 }
 async update(u:Principal,id:string,d:ReservationUpdateDto){
  await this.tx(async tx=>{
   const r=await this.lockReservation(tx,id);
   await this.authorize(tx,u,r.sucursalId,true);
   requireEditable(r.estado);
   const inicio=d.inicio??r.inicio.toISOString(),fin=d.fin??r.fin.toISOString();
   const window=validateWindow(inicio,fin);
   const persons=d.personas??r.personas;
   await this.customer(tx,r.sucursalId,d.clienteId);
   const old=await tx.reservaMesa.findMany({where:{reservaId:id},select:{mesaId:true}});
   const tableIds=d.mesaIds??old.map(t=>t.mesaId);
   await this.assertTables(tx,r.sucursalId,tableIds,persons,window.inicio,window.fin,id);
   await tx.reserva.update({where:{id},data:{
    ...(d.nombreContacto!==undefined?{nombreContacto:d.nombreContacto.trim()}:{}),
    ...(d.telefonoContacto!==undefined?{telefonoContacto:d.telefonoContacto?.trim()||null}:{}),
    ...(d.emailContacto!==undefined?{emailContacto:d.emailContacto?.trim()||null}:{}),
    ...(d.clienteId!==undefined?{clienteId:d.clienteId}:{}),
    ...(d.notas!==undefined?{notas:d.notas?.trim()||null}:{}),
    personas:persons,inicio:window.inicio,fin:window.fin
   }});
   if(d.mesaIds!==undefined){
    await tx.reservaMesa.deleteMany({where:{reservaId:id}});
    await tx.reservaMesa.createMany({data:tableIds.map(mesaId=>({reservaId:id,mesaId}))});
   }
   await this.event(tx,u,id,r.sucursalId,'RESERVATION_UPDATED');
  });
  return this.detail(u,id);
 }
 async confirm(u:Principal,id:string){
  await this.tx(async tx=>{
   const r=await this.lockReservation(tx,id);
   await this.authorize(tx,u,r.sucursalId,true);
   if(r.estado==='CONFIRMADA')return;
   if(r.estado!=='PENDIENTE')throw new ConflictException('Solo puede confirmar una reserva pendiente');
   await tx.reserva.update({where:{id},data:{estado:'CONFIRMADA'}});
   await this.event(tx,u,id,r.sucursalId,'RESERVATION_CONFIRMED');
  });
  return this.detail(u,id);
 }
 async cancel(u:Principal,id:string,d:ReservationReasonDto){
  await this.tx(async tx=>{
   const r=await this.lockReservation(tx,id);
   await this.authorize(tx,u,r.sucursalId,true);
   if(r.estado==='CANCELADA')return;
   requireEditable(r.estado);
   await tx.reserva.update({where:{id},data:{estado:'CANCELADA'}});
   await this.event(tx,u,id,r.sucursalId,'RESERVATION_CANCELLED',d.motivo.trim());
  });
  return this.detail(u,id);
 }
 async noShow(u:Principal,id:string,d:ReservationReasonDto){
  await this.tx(async tx=>{
   const r=await this.lockReservation(tx,id);
   await this.authorize(tx,u,r.sucursalId,true);
   if(r.estado==='NO_ASISTIO')return;
   requireEditable(r.estado);
   noShowWindow(r.inicio);
   await tx.reserva.update({where:{id},data:{estado:'NO_ASISTIO'}});
   await this.event(tx,u,id,r.sucursalId,'RESERVATION_NO_SHOW',d.motivo.trim());
  });
  return this.detail(u,id);
 }
 async checkIn(u:Principal,id:string){
  await this.tx(async tx=>{
   const r=await this.lockReservation(tx,id);
   await this.authorize(tx,u,r.sucursalId,true);
   if(r.estado==='COMPLETADA')return;
   if(r.estado!=='CONFIRMADA')
    throw new ConflictException('La reserva debe estar confirmada para registrar llegada');
   checkInWindow(r.inicio,r.fin);
   const allocation=await tx.reservaMesa.findMany({where:{reservaId:id},select:{mesaId:true}});
   const ids=allocation.map(x=>x.mesaId);
   if(!ids.length)throw new ConflictException('Reservación sin mesas');
   await this.lockTables(tx,ids);
   const activeTables=await tx.mesa.count({where:{id:{in:ids},activa:true,
    sala:{sucursalId:r.sucursalId,activa:true}}});
   if(activeTables!==ids.length)throw new ConflictException('Una mesa ya no está activa');
   const occupied=await tx.ocupacionMesa.findMany({where:{mesaId:{in:ids},cerradaEn:null}});
   if(occupied.length)throw new ConflictException('La mesa ya está ocupada');
   await tx.ocupacionMesa.createMany({data:ids.map(mesaId=>({
    mesaId,reservaId:id,abiertaPorId:u.id
   }))});
   await tx.reserva.update({where:{id},data:{estado:'COMPLETADA'}});
   await this.event(tx,u,id,r.sucursalId,'RESERVATION_CHECKED_IN');
   for(const mesaId of ids){
    await tx.eventoOutbox.create({data:{tipo:'TABLE_OCCUPIED',agregado:'Mesa',agregadoId:mesaId,
     payload:{sucursalId:r.sucursalId,reservaId:id} as Prisma.InputJsonValue}});
   }
  });
  return this.detail(u,id);
 }
}
