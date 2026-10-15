import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {CatalogService} from './catalog.service.js';
import {CatalogMediaService} from './catalog-media.service.js';
import type {CatalogRepositoryPort} from './ports/catalog.repository.port.js';
import type {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import type {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import type {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
import type {Principal} from '../../auth/application/auth.service.js';

const user:Principal={id:'u1',nombre:'Test',email:'test@example.com',sessionId:'s1',
 versionAutorizacion:1,debeCambiarContrasena:false};
describe('CAT-A normalized catalog prices',()=>{
 it('normalizes modifier amounts for groups, options, and lists',async()=>{
  const raw=new Prisma.Decimal('5');
  const repo={
   scope:vi.fn().mockResolvedValue({global:true,branchIds:[]}),
   modifierGroups:vi.fn().mockResolvedValue({data:[{id:'g',modificadoresComoGrupo:[{incrementoPrecio:raw}]}],total:1}),
   groupOptions:vi.fn().mockResolvedValue({data:[{id:'g',modificadoresComoGrupo:[{incrementoPrecio:raw}]}],nextCursor:null}),
   modifiers:vi.fn().mockResolvedValue({data:[{id:'m',incrementoPrecio:raw}],total:1})
  } as unknown as CatalogRepositoryPort;
  const identities={capabilities:vi.fn().mockResolvedValue(['catalog.read'])} as unknown as IdentityRepository;
  const media=new CatalogMediaService({} as MediaRepositoryPort,{} as FileStoragePort);
  const svc=new CatalogService(repo,identities,media);
  const list=await svc.groups(user,{page:1,limit:10});
  const options=await svc.groupOptions(user,{limit:10});
  const modifiers=await svc.modifiers(user,{page:1,limit:10});
  expect(JSON.parse(JSON.stringify(list)).data[0].modificadoresComoGrupo[0].incrementoPrecio).toBe('5.00');
  expect(JSON.parse(JSON.stringify(options)).data[0].modificadoresComoGrupo[0].incrementoPrecio).toBe('5.00');
  expect(JSON.parse(JSON.stringify(modifiers)).data[0].incrementoPrecio).toBe('5.00');
  expect(raw.toString()).toBe('5');
 });
});
