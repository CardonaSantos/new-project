import {ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../auth/application/auth.service.js';
import type {BranchChanges,CompanyChanges,ConfigChanges,DeviceChanges,DeviceFilter,DeviceType,ListFilter} from '../domain/organization.types.js';
import {branchCode,currency,cutoff,deviceCode,name,requireChanges,timezone} from '../domain/organization.policy.js';
import {OrganizationRepositoryPort,type AccessScope} from './ports/organization.repository.port.js';

const pagination=(page:number,limit:number,total:number)=>({page,limit,total,totalPages:Math.ceil(total/limit)});
@Injectable()
export class OrganizationService{
 constructor(private readonly repo:OrganizationRepositoryPort,private readonly identity:IdentityRepository){}
 private async global(actor:Principal,permission:string):Promise<void>{
  if(!(await this.identity.capabilities(actor.id,null)).includes(permission))
   throw new ForbiddenException('Permiso global insuficiente');
 }
 private async forBranch(actor:Principal,permission:string,id:string):Promise<void>{
  if(!(await this.identity.capabilities(actor.id,id)).includes(permission))
   throw new ForbiddenException('Permiso insuficiente para la sucursal');
 }
 private async scope(actor:Principal,permission:string):Promise<AccessScope>{
  return this.repo.branchScope(actor.id,permission);
 }
 private async verifyVisible(actor:Principal,id:string,permission:string){
  await this.forBranch(actor,permission,id);
  const item=await this.repo.branch(id);
  if(!item)throw new NotFoundException('Sucursal no encontrada');
  return item;
 }
 async company(actor:Principal){
  await this.global(actor,'organization.read');
  const result=await this.repo.company();
  if(!result)throw new NotFoundException('Configure la empresa mediante el seed inicial');
  return result;
 }
 async updateCompany(actor:Principal,changes:CompanyChanges){
  requireChanges(changes);
  await this.global(actor,'organization.manage');
  return this.repo.updateCompany(actor.id,{
   ...changes,nombreComercial:changes.nombreComercial===undefined?undefined:name(changes.nombreComercial),
   moneda:changes.moneda===undefined?undefined:currency(changes.moneda),
   zonaHoraria:changes.zonaHoraria===undefined?undefined:timezone(changes.zonaHoraria)
  });
 }
 async branches(actor:Principal,q:ListFilter){
  const scope=await this.scope(actor,'branches.read');
  const result=await this.repo.listBranches(q,scope);
  return {data:result.data,meta:pagination(q.page,q.limit,result.total)};
 }
 async branchOptions(actor:Principal,q:{search?:string;cursor?:string;limit:number}){
  const scope=await this.scope(actor,'branches.read');
  const result=await this.repo.branchOptions(q,scope);
  return {data:result.data,meta:{hasMore:!!result.nextCursor,nextCursor:result.nextCursor}};
 }
 async myAccess(actor:Principal){return {data:await this.repo.myBranches(actor.id)};}
 async branch(actor:Principal,id:string){return this.verifyVisible(actor,id,'branches.read');}
 async overview(actor:Principal,id:string){
  await this.verifyVisible(actor,id,'branches.read');
  return this.repo.branchOverview(id);
 }
 async createBranch(actor:Principal,input:{codigo:string;nombre:string;direccion?:string;telefono?:string;zonaHoraria?:string}){
  await this.global(actor,'branches.manage');
  return this.repo.createBranch(actor.id,{...input,codigo:branchCode(input.codigo),
   nombre:name(input.nombre),zonaHoraria:input.zonaHoraria?timezone(input.zonaHoraria):undefined});
 }
 async updateBranch(actor:Principal,id:string,changes:BranchChanges){
  requireChanges(changes);
  await this.forBranch(actor,'branches.manage',id);
  return this.repo.updateBranch(actor.id,id,{...changes,
   nombre:changes.nombre===undefined?undefined:name(changes.nombre),zonaHoraria:changes.zonaHoraria===undefined?undefined:timezone(changes.zonaHoraria)});
 }
 async status(actor:Principal,id:string,active:boolean,reason:string){
  await this.forBranch(actor,'branches.manage',id);
  return this.repo.changeBranchStatus(actor.id,id,active,reason);
 }
 async config(actor:Principal,id:string){
  await this.verifyVisible(actor,id,'branches.read');
  const config=await this.repo.branchConfig(id);
  if(!config)throw new NotFoundException('Configuración de sucursal no encontrada');
  return config;
 }
 async updateConfig(actor:Principal,id:string,changes:ConfigChanges){
  requireChanges(changes);
  await this.forBranch(actor,'branches.manage',id);
  return this.repo.updateBranchConfig(actor.id,id,{
   ...changes,horaCorteOperativo:changes.horaCorteOperativo===undefined?undefined:cutoff(changes.horaCorteOperativo),
   moneda:changes.moneda===undefined?undefined:currency(changes.moneda)
  });
 }
 async devices(actor:Principal,q:DeviceFilter){
  const scope=await this.scope(actor,'devices.read');
  const result=await this.repo.listDevices(q,scope);
  return {data:result.data,meta:pagination(q.page,q.limit,result.total)};
 }
 async deviceOptions(actor:Principal,q:{search?:string;cursor?:string;limit:number;sucursalId?:string;tipo?:DeviceType}){
  const scope=await this.scope(actor,'devices.read');
  const result=await this.repo.deviceOptions(q,scope);
  return {data:result.data,meta:{hasMore:!!result.nextCursor,nextCursor:result.nextCursor}};
 }
 async device(actor:Principal,id:string){
  const item=await this.repo.device(id);
  if(!item)throw new NotFoundException('Dispositivo no encontrado');
  await this.forBranch(actor,'devices.read',item.sucursalId);
  return item;
 }
 async createDevice(actor:Principal,input:{sucursalId:string;codigo:string;nombre:string;tipo:DeviceType;estacionPreparacionId?:string|null}){
  await this.forBranch(actor,'devices.manage',input.sucursalId);
  return this.repo.createDevice(actor.id,{...input,codigo:deviceCode(input.codigo),nombre:name(input.nombre)});
 }
 async updateDevice(actor:Principal,id:string,changes:DeviceChanges){
  requireChanges(changes);
  const item=await this.repo.device(id);
  if(!item)throw new NotFoundException('Dispositivo no encontrado');
  await this.forBranch(actor,'devices.manage',item.sucursalId);
  return this.repo.updateDevice(actor.id,id,{...changes,nombre:changes.nombre===undefined?undefined:name(changes.nombre)});
 }
 async deviceStatus(actor:Principal,id:string,active:boolean,reason:string){
  const item=await this.repo.device(id);
  if(!item)throw new NotFoundException('Dispositivo no encontrado');
  await this.forBranch(actor,'devices.manage',item.sucursalId);
  return this.repo.changeDeviceStatus(actor.id,id,active,reason);
 }
}
