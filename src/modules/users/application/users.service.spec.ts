import {describe,it,expect,vi} from 'vitest';
import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {UsersService} from './users.service.js';
import type {Principal} from '../../auth/application/auth.service.js';
import type {UsersRepositoryPort} from './ports/users.repository.port.js';
import type {UserActivityPort} from './ports/user-activity.port.js';
import type {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import type {PasswordHasher} from '../../auth/application/ports/crypto.ports.js';
import type {AvatarResolver} from './avatar-resolver.service.js';
import type {UserRecord} from '../domain/user.types.js';

const admin:Principal={id:'admin',email:'admin@example.com',nombre:'Admin',sessionId:'s',
 debeCambiarContrasena:false,versionAutorizacion:1};
const other:Principal={...admin,id:'manager'};
const subject:UserRecord={
 id:'u1',email:'employee@example.com',nombre:'Empleado',activo:true,
 debeCambiarContrasena:false,ultimoAccesoEn:null,creadoEn:new Date(),actualizadoEn:new Date(),
 perfil:null,assignments:[{id:'a1',rolId:'r1',rolCodigo:'CAJERO',rolNombre:'Cajero',
  alcance:'SUCURSAL',sucursalId:'b1',sucursalNombre:'Central'},
 {id:'a2',rolId:'r2',rolCodigo:'MESERO',rolNombre:'Mesero',
  alcance:'SUCURSAL',sucursalId:'b2',sucursalNombre:'Secundaria'}]
};
function setup(){
 const repo={
  isGlobalSuperAdmin:vi.fn().mockResolvedValue(true),
  getUser:vi.fn().mockResolvedValue(subject),
  listUsers:vi.fn().mockResolvedValue({data:[subject],total:1}),
  create:vi.fn().mockResolvedValue('u1'),
  hasOpenOperations:vi.fn().mockResolvedValue(false),
  setActive:vi.fn(),resetPassword:vi.fn(),sessions:vi.fn().mockResolvedValue({data:[],total:0}),
  replaceAssignments:vi.fn(),getAudit:vi.fn().mockResolvedValue({data:[],total:0}),
 } as unknown as UsersRepositoryPort;
 const identities={capabilities:vi.fn().mockResolvedValue(['users.read'])} as unknown as IdentityRepository;
 const passwords={hash:vi.fn().mockResolvedValue('argon2-digest')} as unknown as PasswordHasher;
 const avatars={resolve:vi.fn().mockResolvedValue(null)} as unknown as AvatarResolver;
 const activity={} as UserActivityPort;
 return {repo,identities,passwords,service:new UsersService(repo,identities,passwords,avatars,activity)};
}
describe('UsersService',()=>{
 it('página resultados sin filtrar en Angular',async()=>{
  const {service,repo}=setup();
  const result=await service.list(admin,{page:2,limit:20});
  expect(result.meta).toEqual({page:2,limit:20,total:1,totalPages:1});
  expect(repo.listUsers).toHaveBeenCalledWith(expect.objectContaining({skip:20,take:20}));
 });
 it('oculta roles de sucursales diferentes al manager',async()=>{
  const {service,repo,identities}=setup();
  vi.mocked(repo.isGlobalSuperAdmin).mockResolvedValue(false);
  const user=await service.detail(other,'u1','b1');
  expect(user.access.assignments).toHaveLength(1);
  expect(user.access.assignments[0].sucursalId).toBe('b1');
  expect(identities.capabilities).toHaveBeenCalledWith('manager','b1');
 });
 it('niega acceso a otras sucursales',async()=>{
  const {service,identities}=setup();
  vi.mocked(identities.capabilities).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  await expect(service.detail(other,'u1','b1')).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('la creación requiere administrador y devuelve credencial temporal una vez',async()=>{
  const {service,repo,passwords}=setup();
  const response=await service.create(admin,{email:'EMPLOYEE@EXAMPLE.COM',nombre:'Nuevo'});
  expect(response.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({email:'employee@example.com',hash:'argon2-digest'}));
  expect(passwords.hash).toHaveBeenCalledOnce();
 });
 it('no permite desactivar a un usuario con caja o reparto pendientes',async()=>{
  const {service,repo}=setup();
  vi.mocked(repo.hasOpenOperations).mockResolvedValue(true);
  await expect(service.changeStatus(admin,'u1',false,'Fin de relación laboral')).rejects.toBeInstanceOf(ConflictException);
  expect(repo.setActive).not.toHaveBeenCalled();
 });
 it('no permite a un admin desactivarse',async()=>{
  const {service}=setup();
  await expect(service.changeStatus(admin,'admin',false,'motivo')).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('no permite gestionar roles sin superadministrador',async()=>{
  const {service,repo}=setup();
  vi.mocked(repo.isGlobalSuperAdmin).mockResolvedValue(false);
  await expect(service.assignments(other,'u1',[])).rejects.toBeInstanceOf(ForbiddenException);
  expect(repo.replaceAssignments).not.toHaveBeenCalled();
 });
});
