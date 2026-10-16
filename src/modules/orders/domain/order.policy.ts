import {BadRequestException,ConflictException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {Prisma} from '../../../generated/prisma/client.js';

export const decimal=(raw:string)=>{
 if(typeof raw!=='string'||!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,3})?$/.test(raw))
  throw new BadRequestException('Cantidad inválida (máximo tres decimales)');
 const n=new Prisma.Decimal(raw);
 if(!n.gt(0))throw new BadRequestException('Cantidad debe ser positiva');
 return n;
};
export const price=(n:Prisma.Decimal)=>n.toFixed(2);
export const qty=(n:Prisma.Decimal)=>n.toFixed(3);
export const sha=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
export const key=(raw:string)=>{
 if(!/^[A-Za-z0-9][A-Za-z0-9:_.-]{5,119}$/.test(raw))throw new BadRequestException('claveOperacion inválida');
 return raw;
};
export function distinct<T>(items:T[],extract:(t:T)=>string,label:string){
 if(new Set(items.map(extract)).size!==items.length)
  throw new ConflictException(label+' duplicado');
}
export function requireNote(note:string){
 if(!note?.trim()||note.trim().length<5)
  throw new BadRequestException('Se requiere motivo de al menos 5 caracteres');
 return note.trim();
}
