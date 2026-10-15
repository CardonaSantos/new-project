import {BadRequestException,ConflictException} from '@nestjs/common';
export type Dimension='UNIDAD'|'MASA'|'VOLUMEN'|'LONGITUD';
export type ArticleKind='INGREDIENTE'|'PREPARACION'|'PRODUCTO_TERMINADO'|'EMPAQUE'|'SUMINISTRO';
export type Changes=Record<string,unknown>;
export function requiredName(value:string):string{
 const s=value.trim();if(!s)throw new BadRequestException('Nombre vacío');return s;
}
export function code(value:string):string{
 const s=value.trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_-]{1,49}$/.test(s))throw new BadRequestException('Código inválido');
 return s;
}
export function positiveDecimal(value:string,precision=6):string{
 if(!/^\d+(?:\.\d+)?$/.test(value))throw new BadRequestException('Cantidad decimal inválida');
 const [whole,fraction='']=value.split('.');
 if(fraction.length>precision||whole.length>20||!/[1-9]/.test(value))
  throw new BadRequestException('Cantidad debe ser positiva y respetar precisión');
 return value;
}
export function nonNegativeDecimal(value:string,precision=6):string{
 if(!/^\d+(?:\.\d+)?$/.test(value))throw new BadRequestException('Decimal inválido');
 const [whole,fraction='']=value.split('.');
 if(fraction.length>precision||whole.length>20)throw new BadRequestException('Precisión excedida');
 return value;
}
export function requireChange(changes:Changes):void{
 if(!Object.keys(changes).length)throw new BadRequestException('No hay campos para modificar');
}
export function expirationRule(lot:boolean,expiry:boolean):void{
 if(expiry&&!lot)throw new ConflictException('Control de vencimiento requiere lotes');
}
export function sameDimension(origin:Dimension,destination:Dimension):void{
 if(origin!==destination)throw new ConflictException('No se convierten unidades de dimensiones distintas');
}
