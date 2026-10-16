
import {BadRequestException,ConflictException,Injectable} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {InventoryPostingEngine} from './inventory-posting.engine.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {amount,qty} from '../../domain/stock.policy.js';
import type {InternalConsumptionDto} from '../../presentation/http/dto/inventory-operations.dto.js';
@Injectable()
export class InventoryInternalConsumptionStore{
 constructor(private readonly engine:InventoryPostingEngine){}
 async execute(u:Principal,d:InternalConsumptionDto){
  const quantity=amount(d.cantidad);
  if(d.destinoUso.trim().length<3||d.motivo.trim().length<5)
   throw new BadRequestException('Destino y motivo insuficientes');
  return this.engine.tx(async tx=>{
   const old=await tx.movimientoInventario.findUnique({where:{claveOperacion:d.claveOperacion}});
   if(old){
    if(old.referenciaTipo!=='CONSUMO_INTERNO'||old.articuloId!==d.articuloId||
     old.ubicacionId!==d.ubicacionId||old.loteId!==(d.loteId??null)||
     !old.cantidad.abs().eq(quantity)||old.usuarioId!==u.id)
      throw new ConflictException('Clave ya utilizada con otros datos');
    const doc=await tx.consumoInterno.findUnique({where:{movimientoId:old.id}});
    if(!doc||doc.destinoUso!==d.destinoUso.trim()||doc.motivo!==d.motivo.trim())
     throw new ConflictException('Solicitud de consumo incompatible');
    return {id:doc.id,movimientoId:old.id,cantidad:qty(quantity)};
   }
   const article=await tx.articuloInventario.findUnique({where:{id:d.articuloId}});
   if(!article?.activo||!['SUMINISTRO','EMPAQUE'].includes(article.tipo))
    throw new ConflictException('Solo SUMINISTRO o EMPAQUE interno');
   const posted=await this.engine.post(tx,{actorId:u.id,articuloId:d.articuloId,
    ubicacionId:d.ubicacionId,loteId:d.loteId??null,cantidad:qty(quantity),
    direction:'OUT',tipo:'CONSUMO_INTERNO',permission:'inventory.consume.internal',
    claveOperacion:d.claveOperacion,referenciaTipo:'CONSUMO_INTERNO',
    referenciaId:d.claveOperacion,nota:'Destino '+d.destinoUso.trim()+'; '+d.motivo.trim()});
   const doc=await tx.consumoInterno.create({data:{articuloId:d.articuloId,ubicacionId:d.ubicacionId,
    loteId:d.loteId??null,cantidad:quantity,destinoUso:d.destinoUso.trim(),
    motivo:d.motivo.trim(),responsableId:u.id,movimientoId:posted.movementId}});
   return {id:doc.id,movimientoId:posted.movementId,cantidad:qty(quantity)};
  });
 }
}
