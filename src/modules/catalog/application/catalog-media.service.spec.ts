import {describe,expect,it} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import type {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import type {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
import {CatalogMediaService} from './catalog-media.service.js';

function presenter(){
 return new CatalogMediaService({} as MediaRepositoryPort, {
  downloadUrl:async()=> 'https://example.test/signed.jpg'
 } as FileStoragePort);
}
describe('CAT-A enriched JSON responses',()=>{
 it('serializes nested Prisma Decimal amounts as fixed-scale money without exposing internals',async()=>{
  const uploaded=new Date('2026-10-15T19:00:00.000Z');
  const data={id:'menu1',version:3,fecha:uploaded,secciones:[{items:[{
   variante:{varianteGrupoModificadoresComoVariante:[{grupo:{
    modificadoresComoGrupo:[
     {id:'extra1',incrementoPrecio:new Prisma.Decimal('5')},
     {id:'extra2',incrementoPrecio:new Prisma.Decimal('2.35')},
     {id:'extra3',incrementoPrecio:new Prisma.Decimal('0')},
    ]
   }}]},
   precio:new Prisma.Decimal('22.00')
  }]}]};
  const result=await presenter().enrich(data) as any;
  const item=result.secciones[0].items[0];
  expect(item.variante.varianteGrupoModificadoresComoVariante[0].grupo.modificadoresComoGrupo)
   .toEqual([
    {id:'extra1',incrementoPrecio:'5.00'},
    {id:'extra2',incrementoPrecio:'2.35'},
    {id:'extra3',incrementoPrecio:'0.00'}
   ]);
  expect(item.precio).toBe('22.00');
  expect(result.fecha).toBe(uploaded);
  expect(JSON.stringify(result)).not.toMatch(/"s":1|"e":0|"d":\[/);
  expect(data.secciones[0].items[0].precio).toBeInstanceOf(Prisma.Decimal);
 });
 it('keeps photos, signed URLs, other object shapes, and null values intact',async()=>{
  const when=new Date('2026-10-15T19:00:00.000Z');
  const src={precio:new Prisma.Decimal('1234567.89'),nullable:null,
   producto:{medios:[{media:{id:'m1',nombreOriginal:'x.jpg',
    urlPublica:'https://example.test/public.jpg',confirmadaEn:when,eliminadaEn:null,
    publico:true,bucket:'b',claveObjeto:'k',mimeType:'image/jpeg'},
    principal:true,orden:0}]}};
  const r=await presenter().enrich(src) as any;
  expect(r.precio).toBe('1234567.89');
  expect(r.nullable).toBeNull();
  expect(r.producto.medios).toBeUndefined();
  expect(r.producto.imagenes).toEqual([{
   mediaId:'m1',principal:true,orden:0,url:'https://example.test/public.jpg'
  }]);
  expect(r.producto.imagenPrincipalUrl).toBe('https://example.test/public.jpg');
 });
});
