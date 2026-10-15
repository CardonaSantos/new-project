import {Injectable} from '@nestjs/common';
import {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
@Injectable()
export class InventoryMediaService{
 constructor(private readonly media:MediaRepositoryPort,private readonly storage:FileStoragePort){}
 private async url(id:string):Promise<string|null>{
  const m=await this.media.getById(id);
  if(!m||!m.confirmadaEn||m.eliminadaEn||m.tipo!=='IMAGEN')return null;
  return m.urlPublica??this.storage.downloadUrl(m.bucket,m.claveObjeto,m.mimeType,
   m.nombreOriginal??'inventario',300);
 }
 async enrich<T>(data:T):Promise<T>{
  if(data===null||typeof data!=='object')return data;
  if(Array.isArray(data))return Promise.all(data.map(x=>this.enrich(x))) as Promise<T>;
  const obj=data as Record<string,unknown>;
  if(!Array.isArray(obj.imagenes))return data;
  const ids=obj.imagenes.map(x=>(x as {mediaId:string}).mediaId);
  const urls=await Promise.all(ids.map(id=>this.url(id)));
  const imagenes=obj.imagenes.map((x,i)=>({...x as object,url:urls[i]}));
  const principal=obj.imagenPrincipalId as string|null|undefined;
  const idx=ids.indexOf(principal??ids[0]);
  return {...obj,imagenes,imagenPrincipalUrl:idx>=0?urls[idx]:null} as T;
 }
}
