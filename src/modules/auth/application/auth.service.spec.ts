import {describe,it,expect,vi} from 'vitest';
import {UnauthorizedException} from '@nestjs/common';
import {AuthService} from './auth.service.js';
import type {IdentityRepository} from './ports/identity.repository.js';
import type {PasswordHasher,SessionTokens} from './ports/crypto.ports.js';
const user={id:'u1',email:'admin@novasistemas.net',nombre:'Admin',hashContrasena:'digest',activo:true,
 debeCambiarContrasena:true,versionAutorizacion:1};
function setup(){
 const repo={
  loginBlocked:vi.fn().mockResolvedValue(false),
  account:vi.fn().mockResolvedValue(user),
  loginFailed:vi.fn(),touchLogin:vi.fn(),
  createSession:vi.fn().mockResolvedValue('s1'),
  sessionById:vi.fn(),sessionByRefreshHash:vi.fn(),
  rotate:vi.fn(),revoke:vi.fn(),revokeAll:vi.fn(),
  changePasswordAndRevokeSessions:vi.fn(),
 } as unknown as IdentityRepository;
 const hash={verify:vi.fn().mockResolvedValue(true),hash:vi.fn().mockResolvedValue('new-digest')} as unknown as PasswordHasher;
 const tokens={refreshToken:vi.fn().mockReturnValue('random-refresh'),
  digest:vi.fn().mockReturnValue('digest-refresh'),sign:vi.fn().mockResolvedValue('signed-jwt'),
  verify:vi.fn().mockResolvedValue({userId:'u1',sessionId:'s1',authorizationVersion:1})
 } as unknown as SessionTokens;
 return {repo,hash,tokens,service:new AuthService(repo,hash,tokens)};
}
describe('AuthService',()=>{
 it('login devuelve token de acceso pero refresh se entrega al controller para cookie',async()=>{
  const {service}=setup();const v=await service.login('ADMIN@NOVASISTEMAS.NET','valid password','127.0.0.1',null);
  expect(v.accessToken).toBe('signed-jwt');expect(v.user.debeCambiarContrasena).toBe(true);
  expect(v.session.id).toBe('s1');
 });
 it('rechaza contraseña equivocada sin filtrar si el correo existe',async()=>{
  const {service,hash,repo}=setup();
  vi.mocked(hash.verify).mockResolvedValue(false);
  await expect(service.login('admin@novasistemas.net','wrong','127.0.0.1',null)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(repo.loginFailed).toHaveBeenCalledOnce();
 });
 it('no permite usar sesión revocada',async()=>{
  const {service,repo}=setup();
  vi.mocked(repo.sessionById).mockResolvedValue(null);
  await expect(service.authenticate('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('cambia contraseña y revoca sesiones de forma transaccional mediante el puerto',async()=>{
  const {service,repo}=setup();
  await service.changePassword({id:'u1',sessionId:'s1',email:user.email,nombre:'Admin',
   debeCambiarContrasena:true,versionAutorizacion:1},'old-password','a-new-password');
  expect(repo.changePasswordAndRevokeSessions).toHaveBeenCalledWith('u1','new-digest');
 });
});
