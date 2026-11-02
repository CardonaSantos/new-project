import {describe,it,expect,vi} from 'vitest';
import {CatalogMediaService} from '../src/modules/catalog/application/catalog-media.service.js';

describe('CAT-A tree media serialization',()=>{
 const service=new CatalogMediaService({} as never,{} as never);
 it('renders nested photo relations and serializes Prisma bigints exactly',async()=>{
  const item={id:'cat',nombre:'Bebidas',parentId:null,medios:[{
   orden:0,principal:true,media:{id:'m1',nombreOriginal:'foto.png',
    confirmadaEn:new Date('2026-10-01'),eliminadaEn:null,
    urlPublica:'https://example.test/photo.png',publico:true,
    bucket:'assets',claveObjeto:'photo.png',mimeType:'image/png',
    tamanoBytes:9007199254740993n}
  }],children:[],totalProductos:1};
  const out=await service.enrich({data:[item],total:1});
  expect(JSON.stringify(out)).toContain('photo.png');
  expect((out.data[0] as unknown as {imagenes:{mediaId:string}[]}).imagenes[0].mediaId).toBe('m1');
  expect(JSON.stringify(out)).not.toContain('tamanoBytes');
 });
 it('preserves arbitrarily large bigint precision in non-photo nested data',async()=>{
  const out=await service.enrich({subtotal:{exactBytes:9007199254740993n}});
  expect(out).toEqual({subtotal:{exactBytes:'9007199254740993'}});
  expect(()=>JSON.stringify(out)).not.toThrow();
 });
});
