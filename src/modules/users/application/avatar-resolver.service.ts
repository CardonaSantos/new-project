import {Injectable} from '@nestjs/common';
import {MediaRepositoryPort} from '../../media/application/ports/media-repository.port.js';
import {FileStoragePort} from '../../media/application/ports/file-storage.port.js';

@Injectable()
export class AvatarResolver {
 constructor(private readonly media:MediaRepositoryPort,private readonly storage:FileStoragePort){}
 async resolve(mediaId:string|null|undefined):Promise<string|null>{
  if(!mediaId)return null;
  const asset=await this.media.getById(mediaId);
  if(!asset||asset.tipo!=='IMAGEN'||!asset.confirmadaEn||asset.eliminadaEn)return null;
  if(asset.urlPublica)return asset.urlPublica;
  return this.storage.downloadUrl(asset.bucket,asset.claveObjeto,asset.mimeType,
   asset.nombreOriginal??'avatar',300);
 }
}
