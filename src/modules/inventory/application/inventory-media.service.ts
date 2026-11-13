import {Injectable} from '@nestjs/common';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
/** See catalog-media.service.ts's MEDIA_URL_TTL_SECONDS for why this isn't 300s anymore —
 * inventory tables/Kardex screens can stay open far longer than 5 minutes too. */
const MEDIA_URL_TTL_SECONDS=86400;
@Injectable()
export class InventoryMediaService{
 constructor(private readonly media:MediaRepositoryPort,private readonly storage:FileStoragePort,
  private readonly db:PrismaService){}
 /** One database lookup for principal pictures in a table page, not N article requests.
  * Signing only the selected picture keeps the response lightweight.
  */
 async primaryUrls(articleIds:readonly string[]):Promise<Map<string,string|null>>{
  const unique=[...new Set(articleIds.filter(Boolean))];
  const result=new Map<string,string|null>(unique.map(id=>[id,null]));
  if(!unique.length)return result;
  const links=await this.db.articuloInventarioMedia.findMany({
   where:{articuloId:{in:unique}},
   include:{media:true},
   orderBy:[{principal:'desc'},{orden:'asc'}]
  });
  const selected=new Map<string,(typeof links)[number]['media']>();
  for(const link of links){
   const m=link.media;
   if(!selected.has(link.articuloId)&&m.confirmadaEn&&!m.eliminadaEn&&m.tipo==='IMAGEN')
    selected.set(link.articuloId,m);
  }
  await Promise.all([...selected].map(async ([id,m])=>{
   try{
    result.set(id,m.urlPublica??await this.storage.downloadUrl(m.bucket,m.claveObjeto,
     m.mimeType,m.nombreOriginal??'inventario',MEDIA_URL_TTL_SECONDS));
   }catch{
    // Optional images must never make inventory quantities or Kardex unavailable.
    result.set(id,null);
   }
  }));
  return result;
 }
 private async url(id:string):Promise<string|null>{
  const m=await this.media.getById(id);
  if(!m||!m.confirmadaEn||m.eliminadaEn||m.tipo!=='IMAGEN')return null;
  return m.urlPublica??this.storage.downloadUrl(m.bucket,m.claveObjeto,m.mimeType,
   m.nombreOriginal??'inventario',MEDIA_URL_TTL_SECONDS);
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
