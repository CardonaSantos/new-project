
import {describe,it,expect,vi} from 'vitest';
import type {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import type {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import type {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
import type {InventoryOperationsPort} from './ports/inventory-operations.port.js';
import {InventoryMediaService} from './inventory-media.service.js';
import {InventoryOperationsService} from './inventory-operations.service.js';

function setup(){
 const db={articuloInventarioMedia:{findMany:vi.fn().mockResolvedValue([])}};
 const storage={downloadUrl:vi.fn().mockResolvedValue('https://private.example/image?expires=300')};
 const images=new InventoryMediaService(
  {} as MediaRepositoryPort,storage as unknown as FileStoragePort,
  db as unknown as PrismaService);
 return {db,storage,images};
}
describe('Inventory pictures in read models',()=>{
 it('queries media once for all article IDs and uses only confirmed principal photos',async()=>{
  const {db,storage,images}=setup();
  db.articuloInventarioMedia.findMany.mockResolvedValueOnce([
   {articuloId:'a1',principal:true,orden:0,media:{
    confirmadaEn:new Date(),eliminadaEn:null,tipo:'IMAGEN',urlPublica:null,
    bucket:'bucket',claveObjeto:'file.jpg',mimeType:'image/jpeg',nombreOriginal:'café.jpg'
   }},
   {articuloId:'a2',principal:true,orden:0,media:{
    confirmadaEn:null,eliminadaEn:null,tipo:'IMAGEN',urlPublica:null,
    bucket:'bucket',claveObjeto:'draft.jpg',mimeType:'image/jpeg',nombreOriginal:'draft.jpg'
   }}
  ] as never);
  const urls=await images.primaryUrls(['a1','a1','a2']);
  expect(db.articuloInventarioMedia.findMany).toHaveBeenCalledTimes(1);
  expect(db.articuloInventarioMedia.findMany.mock.calls[0][0].where)
   .toEqual({articuloId:{in:['a1','a2']}});
  expect(storage.downloadUrl).toHaveBeenCalledTimes(1);
  expect(storage.downloadUrl).toHaveBeenCalledWith('bucket','file.jpg','image/jpeg','café.jpg',86400);
  expect(urls.get('a1')).toContain('expires=300');
  expect(urls.get('a2')).toBeNull();
 });
 it('does not fail stock response when optional image signature fails',async()=>{
  const {db,storage,images}=setup();
  db.articuloInventarioMedia.findMany.mockResolvedValueOnce([{
   articuloId:'a1',principal:true,orden:0,media:{
    confirmadaEn:new Date(),eliminadaEn:null,tipo:'IMAGEN',urlPublica:null,
    bucket:'bucket',claveObjeto:'x',mimeType:'image/png',nombreOriginal:'x.png'
   }}] as never);
  storage.downloadUrl.mockRejectedValueOnce(new Error('Storage unavailable'));
  const port={
   stock:vi.fn().mockResolvedValue({data:[{articulo:{id:'a1',nombre:'Café'},cantidad:'1.000000'}],
    meta:{page:1,limit:20,total:1,totalPages:1}})
  } as unknown as InventoryOperationsPort;
  const svc=new InventoryOperationsService(port,images);
  const value=await svc.stock({} as never,{} as never);
  expect(value.data[0]).toMatchObject({cantidad:'1.000000',articulo:{
   id:'a1',nombre:'Café',imagenPrincipalUrl:null}});
 });
 it('returns image URLs in each compatible response without inventing quantities',async()=>{
  const {images}=setup();
  vi.spyOn(images,'primaryUrls').mockResolvedValue(new Map([['a1','photo-url']]));
  const port={
   stock:vi.fn().mockResolvedValue({data:[{articulo:{id:'a1'},cantidad:'3'}],meta:{}}),
   summary:vi.fn().mockResolvedValue({data:[{articuloId:'a1',cantidad:'3'}]}),
   movements:vi.fn().mockResolvedValue({data:[{articuloId:'a1',articulo:{nombre:'Café'}}]}),
   movement:vi.fn().mockResolvedValue({id:'m1',articulo:{id:'a1',nombre:'Café'}})
  } as unknown as InventoryOperationsPort;
  const svc=new InventoryOperationsService(port,images);
  const stock=await svc.stock({} as never);
  const summary=await svc.summary({} as never);
  const movements=await svc.movements({} as never);
  const movement=await svc.movement({} as never);
  expect(stock.data[0].articulo.imagenPrincipalUrl).toBe('photo-url');
  expect(summary.data[0]).toMatchObject({cantidad:'3',imagenPrincipalUrl:'photo-url'});
  expect(movements.data[0].articulo.imagenPrincipalUrl).toBe('photo-url');
  expect(movement.articulo.imagenPrincipalUrl).toBe('photo-url');
 });
});
