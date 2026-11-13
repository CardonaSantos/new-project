import {Injectable} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
import {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
/** Signed-URL lifetime for non-public media (see enrich() below). 300s (5min) was too short:
 * a self-service table session lasts up to 3h, and a staff order/kitchen screen can stay open far
 * longer than that — both ended up with broken photos partway through. 24h stays well inside the
 * S3-compatible presigner's 7-day max for static credentials (see SpacesAdapter.downloadUrl). */
const MEDIA_URL_TTL_SECONDS=86400;
@Injectable()
export class CatalogMediaService{
 constructor(private readonly media:MediaRepositoryPort,private readonly storage:FileStoragePort){}
 async enrich<T>(value:T):Promise<T>{
  const visit=async(obj:unknown):Promise<unknown>=>{
   // Prisma.Decimal has enumerable internals (s/e/d): never walk it like a plain object.
   // Every Decimal in CAT-A represents a monetary amount with scale 2.
   if(Prisma.Decimal.isDecimal(obj))return obj.toFixed(2);
   // Media size and similar Prisma bigints must be JSON-safe; preserve exact precision.
   if(typeof obj==='bigint')return obj.toString();
   if(!obj||typeof obj!=='object'||obj instanceof Date)return obj;
   if(Array.isArray(obj))return Promise.all(obj.map(visit));
   const item=obj as Record<string,unknown>;
   if('medios' in item&&Array.isArray(item.medios)){
    const photos=await Promise.all(item.medios.map(async(value)=>{
     const relation=value as {media?:{id:string;nombreOriginal:string|null;urlPublica:string|null;confirmadaEn:Date|null;eliminadaEn:Date|null;publico:boolean;bucket:string;claveObjeto:string;mimeType:string},principal?:boolean,orden?:number};
     const m=relation.media;
     if(!m||!m.confirmadaEn||m.eliminadaEn)return null;
     const url=m.urlPublica??await this.storage.downloadUrl(m.bucket,m.claveObjeto,m.mimeType,m.nombreOriginal??'foto',MEDIA_URL_TTL_SECONDS);
     return {mediaId:m.id,principal:relation.principal??false,orden:relation.orden??0,url};
    }));
    const fotos=photos.filter(Boolean) as Array<{mediaId:string;principal:boolean;orden:number;url:string}>;
    const {medios:unused,...other}=item;void unused;
    const res=Object.fromEntries(await Promise.all(Object.entries(other).map(async([key,val])=>[key,await visit(val)])));
    return {...res,imagenes:fotos,imagenPrincipalUrl:fotos.find(x=>x.principal)?.url??fotos[0]?.url??null};
   }
   return Object.fromEntries(await Promise.all(Object.entries(item).map(async([key,val])=>[key,await visit(val)])));
  };
  return await visit(value) as T;
 }
}
