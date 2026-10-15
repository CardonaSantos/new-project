import {Injectable} from '@nestjs/common';
import {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import {FileStoragePort} from '../../media/application/ports/file-storage.port.js';
@Injectable()
export class CatalogMediaService{
 constructor(private readonly media:MediaRepositoryPort,private readonly storage:FileStoragePort){}
 async enrich<T>(value:T):Promise<T>{
  const visit=async(obj:unknown):Promise<unknown>=>{
   if(!obj||typeof obj!=='object'||obj instanceof Date)return obj;
   if(Array.isArray(obj))return Promise.all(obj.map(visit));
   const item=obj as Record<string,unknown>;
   if('medios' in item&&Array.isArray(item.medios)){
    const photos=await Promise.all(item.medios.map(async(value)=>{
     const relation=value as {media?:{id:string;nombreOriginal:string|null;urlPublica:string|null;confirmadaEn:Date|null;eliminadaEn:Date|null;publico:boolean;bucket:string;claveObjeto:string;mimeType:string},principal?:boolean,orden?:number};
     const m=relation.media;
     if(!m||!m.confirmadaEn||m.eliminadaEn)return null;
     const url=m.urlPublica??await this.storage.downloadUrl(m.bucket,m.claveObjeto,m.mimeType,m.nombreOriginal??'foto',300);
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
