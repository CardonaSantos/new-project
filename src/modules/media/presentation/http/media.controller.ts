import {BadRequestException,Body,Controller,Delete,Get,Param,Post,Query,UploadedFile,UploadedFiles,UseInterceptors} from '@nestjs/common';
import {FileInterceptor,FilesInterceptor} from '@nestjs/platform-express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {MediaService} from '../../application/media.service.js';
import {MediaListDto,MediaPresignDto,MediaUploadDto} from './dto/media.dto.js';

@Controller('media')
export class MediaController {
 constructor(private readonly media:MediaService){}

 @Post('upload')
 @UseInterceptors(FileInterceptor('file',{
  limits:{fileSize:20*1024*1024,files:1,fields:5,parts:7,fieldSize:2048},
 }))
 upload(@CurrentUser() user:Principal,@UploadedFile() file:{buffer:Buffer;mimetype:string;originalname:string;size:number} | undefined,@Body() dto:MediaUploadDto){
  if(!file?.buffer)throw new BadRequestException('Adjunta un archivo en el campo file');
  return this.media.upload(user,{
   file:file.buffer,declaredMime:file.mimetype,name:file.originalname,
   contexto:dto.contexto,sucursalId:dto.sucursalId??null,publico:dto.publico
  });
 }


 @Post('batch')
 @UseInterceptors(FilesInterceptor('files',5,{
  limits:{fileSize:10*1024*1024,files:5,fields:5,parts:10,fieldSize:2048}
 }))
 async batch(@CurrentUser() user:Principal,
  @UploadedFiles() files:Array<{buffer:Buffer;mimetype:string;originalname:string;size:number}> | undefined,
  @Body() dto:MediaUploadDto){
  if(!files?.length)throw new BadRequestException('Adjunta archivos en el campo files');
  const settled=await Promise.allSettled(files.map(file=>this.media.upload(user,{
   file:file.buffer,declaredMime:file.mimetype,name:file.originalname,
   contexto:dto.contexto,sucursalId:dto.sucursalId??null,publico:dto.publico
  })));
  return {
   count:settled.filter(item=>item.status==='fulfilled').length,
   total:files.length,
   items:settled.map((result,index)=>result.status==='fulfilled'
    ?{index,ok:true,media:result.value}
    :{index,ok:false,error:'No se pudo subir el archivo'})
  };
 }

 @Post('presign')
 presign(@CurrentUser() user:Principal,@Body() dto:MediaPresignDto){
  return this.media.presign(user,{
   mime:dto.mime,name:dto.nombre,size:dto.sizeBytes,
   contexto:dto.contexto,sucursalId:dto.sucursalId??null,publico:dto.publico
  });
 }

 @Post(':id/confirm')
 confirm(@CurrentUser() user:Principal,@Param('id') id:string){
  return this.media.confirm(user,id);
 }

 @Get()
 list(@CurrentUser() user:Principal,@Query() dto:MediaListDto){
  return this.media.list(user,{
   sucursalId:dto.sucursalId??null,tipo:dto.tipo,contexto:dto.contexto,
   page:dto.page,limit:dto.limit
  });
 }

 @Get(':id/access')
 access(@CurrentUser() user:Principal,@Param('id') id:string){
  return this.media.access(user,id);
 }

 @Get(':id')
 detail(@CurrentUser() user:Principal,@Param('id') id:string){
  return this.media.detail(user,id);
 }

 @Delete(':id')
 remove(@CurrentUser() user:Principal,@Param('id') id:string){
  return this.media.remove(user,id);
 }
}
