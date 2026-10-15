import {describe,it,expect,vi} from 'vitest';
import {ForbiddenException} from '@nestjs/common';
import {CatalogService} from './catalog.service.js';
import type {CatalogRepositoryPort} from './ports/catalog.repository.port.js';
import type {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import type {CatalogMediaService} from './catalog-media.service.js';
import type {Principal} from '../../auth/application/auth.service.js';
const actor:Principal={id:'staff',email:'user@example.com',nombre:'Staff',sessionId:'s',
 versionAutorizacion:1,debeCambiarContrasena:false};
function factory(){
 const repo={scope:vi.fn().mockResolvedValue({global:false,branchIds:['b1']}),
  menus:vi.fn().mockResolvedValue({data:[],total:0}),
  createVariantPrice:vi.fn().mockResolvedValue({id:'p1'}),summary:vi.fn().mockResolvedValue({}),
  productOptions:vi.fn().mockResolvedValue({data:[],nextCursor:null})} as unknown as CatalogRepositoryPort;
 const identity={capabilities:vi.fn().mockResolvedValue(['catalog.read'])} as unknown as IdentityRepository;
 const media={enrich:vi.fn(async(x:unknown)=>x)} as unknown as CatalogMediaService;
 return {repo,identity,service:new CatalogService(repo,identity,media)};
}
describe('Catalog access boundaries',()=>{
 it('denies pricing writes for users without branch permission',async()=>{
  const {service,repo}=factory();
  await expect(service.createPrice(actor,'variant',{
   entityId:'v1',sucursalId:'b2',importe:'20.00',vigenteDesde:'2026-10-15T12:00:00Z'
  })).rejects.toBeInstanceOf(ForbiddenException);
  expect(repo.createVariantPrice).not.toHaveBeenCalled();
 });
 it('passes scope into SQL-backed menu filtering',async()=>{
  const {service,repo}=factory();
  await service.menus(actor,{page:1,limit:10});
  expect(repo.menus).toHaveBeenCalledWith({page:1,limit:10},undefined,['b1']);
 });
 it('rejects catalog reports across branches',async()=>{
  const {service,repo}=factory();
  await expect(service.summary(actor,'b2')).rejects.toBeInstanceOf(ForbiddenException);
  expect(repo.summary).not.toHaveBeenCalled();
 });
});
