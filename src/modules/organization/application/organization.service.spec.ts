import {describe,expect,it,vi} from 'vitest';
import {ForbiddenException,NotFoundException} from '@nestjs/common';
import {OrganizationService} from './organization.service.js';
import type {OrganizationRepositoryPort} from './ports/organization.repository.port.js';
import type {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../auth/application/auth.service.js';
const actor={id:'actor',email:'actor@example.com',nombre:'Administrador',
 sessionId:'s',debeCambiarContrasena:false,versionAutorizacion:1} satisfies Principal;
function setup(){
 const repo={
  branchScope:vi.fn().mockResolvedValue({global:false,branchIds:['b1']}),
  listBranches:vi.fn().mockResolvedValue({data:[],total:0}),
  branchOptions:vi.fn().mockResolvedValue({data:[],nextCursor:null}),
  branch:vi.fn().mockResolvedValue({id:'b1',nombre:'Principal'}),
  updateBranch:vi.fn().mockResolvedValue({id:'b1'}),
  createBranch:vi.fn().mockResolvedValue({id:'b2'}),
  company:vi.fn().mockResolvedValue({id:'org'}),
  updateCompany:vi.fn().mockResolvedValue({id:'org'}),
  createDevice:vi.fn().mockResolvedValue({id:'d1'}),
  device:vi.fn().mockResolvedValue({id:'d1',sucursalId:'b1'}),
  updateDevice:vi.fn().mockResolvedValue({id:'d1'}),
  changeBranchStatus:vi.fn().mockResolvedValue({id:'b1',activa:false}),
  myBranches:vi.fn().mockResolvedValue([])
 } as unknown as OrganizationRepositoryPort;
 const identity={capabilities:vi.fn().mockResolvedValue([])} as unknown as IdentityRepository;
 return {repo,identity,service:new OrganizationService(repo,identity)};
}
describe('OrganizationService',()=>{
 it('filtra sucursales mediante alcance de repositorio',async()=>{
  const {repo,service}=setup();
  const result=await service.branches(actor,{page:2,limit:10});
  expect(result.meta.totalPages).toBe(0);
  expect(repo.listBranches).toHaveBeenCalledWith({page:2,limit:10},{global:false,branchIds:['b1']});
 });
 it('no expone configuración empresarial a personal sin privilegio global',async()=>{
  const {repo,service}=setup();
  await expect(service.company(actor)).rejects.toBeInstanceOf(ForbiddenException);
  expect(repo.company).not.toHaveBeenCalled();
 });
 it('impide editar dispositivos de otra sucursal',async()=>{
  const {repo,service,identity}=setup();
  await expect(service.updateDevice(actor,'d1',{nombre:'KDS'})).rejects.toBeInstanceOf(ForbiddenException);
  expect(identity.capabilities).toHaveBeenCalledWith(actor.id,'b1');
  expect(repo.updateDevice).not.toHaveBeenCalled();
 });
 it('permite crear sucursal solo con permisos globales',async()=>{
  const {repo,service,identity}=setup();
  vi.mocked(identity.capabilities).mockResolvedValue(['branches.manage']);
  await service.createBranch(actor,{codigo:' norte-1 ',nombre:'Norte'});
  expect(repo.createBranch).toHaveBeenCalledWith(actor.id,{codigo:'NORTE-1',nombre:'Norte',zonaHoraria:undefined});
 });
 it('exige permisos de la sucursal antes de desactivarla',async()=>{
  const {repo,service,identity}=setup();
  vi.mocked(identity.capabilities).mockResolvedValue(['branches.manage']);
  await service.status(actor,'b1',false,'Cierre temporal');
  expect(identity.capabilities).toHaveBeenCalledWith(actor.id,'b1');
  expect(repo.changeBranchStatus).toHaveBeenCalledWith(actor.id,'b1',false,'Cierre temporal');
 });
 it('rechaza sucursal inexistente tras verificar alcance',async()=>{
  const {repo,service,identity}=setup();
  vi.mocked(identity.capabilities).mockResolvedValue(['branches.read']);
  vi.mocked(repo.branch).mockResolvedValue(null);
  await expect(service.branch(actor,'desconocida')).rejects.toBeInstanceOf(NotFoundException);
 });
});
