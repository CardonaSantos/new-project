import {Injectable,ConflictException} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {MediaRepositoryPort} from '../../application/ports/media-repository.port.js';
import type {MediaRecord,NewMedia,MediaTipo} from '../../domain/media.types.js';
import {MediaMapper} from './media.mapper.js';

@Injectable()
export class PrismaMediaRepository extends MediaRepositoryPort {
 constructor(private readonly prisma:PrismaService){super();}
 async create(input:NewMedia):Promise<MediaRecord>{
  const row=await this.prisma.media.create({data:input});
  return MediaMapper.toDomain(row);
 }
 async getById(id:string):Promise<MediaRecord|null>{
  const row=await this.prisma.media.findUnique({where:{id}});
  return row?MediaMapper.toDomain(row):null;
 }
 async list(input:{sucursalId:string|null;tipo?:MediaTipo;contexto?:string;page:number;limit:number}){
  const where={
   sucursalId:input.sucursalId,tipo:input.tipo,contexto:input.contexto,
   eliminadaEn:null,confirmadaEn:{not:null},
  };
  const [rows,total]=await this.prisma.$transaction([
   this.prisma.media.findMany({
    where,orderBy:[{creadoEn:'desc'},{id:'desc'}],
    skip:(input.page-1)*input.limit,take:input.limit
   }),
   this.prisma.media.count({where}),
  ]);
  return {data:rows.map(MediaMapper.toDomain),total};
 }
 async confirm(id:string,input:{size:bigint;mime:string;hash:string|null;etag:string|null;publicUrl:string|null}){
  const updated=await this.prisma.media.updateMany({
   where:{id,confirmadaEn:null,eliminadaEn:null},
   data:{tamanoBytes:input.size,mimeType:input.mime,hashContenido:input.hash,
    etag:input.etag,urlPublica:input.publicUrl,confirmadaEn:new Date()},
  });
  if(updated.count!==1)throw new ConflictException('La media ya está confirmada o eliminada');
  const row=await this.prisma.media.findUniqueOrThrow({where:{id}});
  return MediaMapper.toDomain(row);
 }
 async hasReferences(id:string):Promise<boolean>{
  const row=await this.prisma.media.findUnique({
   where:{id},select:{_count:{select:{
    perfilesComoAvatar:true,productosComoMedia:true,variantesComoMedia:true,
    articulosComoMedia:true,categoriasComoMedia:true
   }}}
  });
  if(!row)return false;
  return Object.values(row._count).some(x=>x>0);
 }
 async markDeleted(id:string):Promise<void>{
  await this.prisma.media.updateMany({where:{id,eliminadaEn:null},data:{eliminadaEn:new Date()}});
 }
 async removePending(id:string):Promise<void>{
  await this.prisma.media.deleteMany({where:{id,confirmadaEn:null}});
 }
 async listStalePending(before:Date,limit:number):Promise<MediaRecord[]>{
  const rows=await this.prisma.media.findMany({
   where:{confirmadaEn:null,creadoEn:{lt:before},eliminadaEn:null},
   orderBy:{creadoEn:'asc'},take:limit
  });
  return rows.map(MediaMapper.toDomain);
 }
 async claimStalePending(id:string,before:Date):Promise<boolean>{
  const result=await this.prisma.media.updateMany({
   where:{id,confirmadaEn:null,eliminadaEn:null,creadoEn:{lt:before}},
   data:{eliminadaEn:new Date()}
  });
  return result.count===1;
 }
 async releasePendingClaim(id:string):Promise<void>{
  await this.prisma.media.updateMany({
   where:{id,confirmadaEn:null,eliminadaEn:{not:null}},
   data:{eliminadaEn:null}
  });
 }

}
