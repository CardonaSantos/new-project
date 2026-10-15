import {describe,it,expect,vi} from 'vitest';
import {ForbiddenException} from '@nestjs/common';
import {InventoryService} from './inventory.service.js';
import type {InventoryRepositoryPort} from './ports/inventory.repository.port.js';
import type {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import type {InventoryMediaService} from './inventory-media.service.js';
import type {Principal} from '../../auth/application/auth.service.js';
const admin:Principal={id:'admin',email:'admin@coffee.gt',nombre:'Admin',
 sessionId:'s',debeCambiarContrasena:false,versionAutorizacion:1};
const article={id:'a1',codigo:'LECHE-01',nombre:'Leche',costoReferencia:'0.020000',stockMinimo:'5.000000',
 imagenes:[],imagenPrincipalId:null};
function build(){
 const repo={
  scope:vi.fn().mockResolvedValue({global:false,branchIds:['b1']}),
  listWarehouses:vi.fn().mockResolvedValue({data:[],total:0}),
  listArticles:vi.fn().mockResolvedValue({data:[article],total:1}),
  articleOptions:vi.fn().mockResolvedValue({data:[{...article,label:'Leche'}],nextCursor:null}),
  getArticle:vi.fn().mockResolvedValue(article),
  createArticle:vi.fn().mockResolvedValue(article),
  createWarehouse:vi.fn().mockResolvedValue({id:'w1'})
 } as unknown as InventoryRepositoryPort;
 const identity={capabilities:vi.fn().mockResolvedValue([])} as unknown as IdentityRepository;
 const media={enrich:vi.fn(async(x:unknown)=>x)} as unknown as InventoryMediaService;
 return {repo,identity,media,service:new InventoryService(repo,identity,media)};
}
describe('InventoryService',()=>{
 it('oculta costos a lectores que carecen del permiso específico',async()=>{
  const {service}=build();
  const result=await service.articles(admin,{page:1,limit:10});
  const r=result.data as Array<Record<string,unknown>>;
  expect(r[0].costoReferencia).toBeUndefined();
  expect(r[0].stockMinimo).toBe('5.000000');
 });
 it('exige autorización específica para cambios de costo',async()=>{
  const {service,identity,repo}=build();
  vi.mocked(identity.capabilities).mockResolvedValue(['inventory.articles.manage']);
  await expect(service.createArticle(admin,{codigo:'LECHE-01',nombre:'Leche',
   tipo:'INGREDIENTE',unidadBaseId:'g',costoReferencia:'1.000000'})).rejects.toBeInstanceOf(ForbiddenException);
  expect(repo.createArticle).not.toHaveBeenCalled();
 });
 it('impide crear almacenes fuera del permiso de sucursal',async()=>{
  const {service,repo}=build();
  await expect(service.createWarehouse(admin,{codigo:'BOD01',nombre:'Bodega',
   sucursalId:'otra'})).rejects.toBeInstanceOf(ForbiddenException);
  expect(repo.createWarehouse).not.toHaveBeenCalled();
 });
 it('construye la paginación en el servidor',async()=>{
  const {service,repo}=build();
  const q={page:2,limit:20,sucursalId:'b1'};
  const result=await service.warehouses(admin,q);
  expect(result.meta).toEqual({page:2,limit:20,total:0,totalPages:0});
  expect(repo.listWarehouses).toHaveBeenCalledWith(q,{global:false,branchIds:['b1']});
 });
 it('permite acceso global únicamente con permiso de lectura',async()=>{
  const {service,repo}=build();
  vi.mocked(repo.scope).mockResolvedValue({global:false,branchIds:[]});
  await expect(service.articles(admin,{page:1,limit:20})).rejects.toBeInstanceOf(ForbiddenException);
 });
});
