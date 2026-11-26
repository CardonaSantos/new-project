import {BadRequestException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
import {amount,cost} from './stock.policy.js';

/**
 * Stock entries written the way things are bought: «2 L at Q20 each» or «2 L, Q40 in all»,
 * instead of «2000 ml at Q0.02». Stock is always kept in the article's base unit; this turns
 * what the person typed into base quantity and base unit cost, with the conversion factor of
 * the chosen unit or purchase presentation (base units in ONE chosen unit).
 */
export interface EntryInput{
 /** In the chosen unit (or the base unit when none is chosen). */
 cantidad:string;
 /** Per chosen unit. */
 costoUnitario?:string;
 /** For the whole line: «I paid Q40 for all of it». */
 costoTotal?:string;
}
export interface ResolvedEntry{
 /** Base units. */
 cantidad:string;
 /** Per base unit; undefined when no cost was given (outbound, waste). */
 costoUnitario?:string;
 /** Exact line total to book, when the cost came per chosen unit or as a total. */
 costoTotal?:string;
}

const fixed=(v:Prisma.Decimal)=>v.toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP).toFixed(6);

export function resolveEntry(input:EntryInput,factor:Prisma.Decimal|null):ResolvedEntry{
 if(input.costoUnitario!==undefined&&input.costoTotal!==undefined)
  throw new BadRequestException('Indique costo unitario o costo total, no ambos');
 const typed=amount(input.cantidad);
 if(factor!==null&&!factor.greaterThan(0))throw new BadRequestException('Factor de conversión inválido');
 const f=factor??new Prisma.Decimal(1);
 const base=typed.mul(f).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
 if(!base.greaterThan(0))throw new BadRequestException('Cantidad convertida demasiado pequeña');
 if(base.greaterThan('99999999999999.999999'))throw new BadRequestException('Cantidad convertida fuera de rango');
 if(input.costoTotal!==undefined){
  const total=cost(input.costoTotal);
  return {cantidad:fixed(base),costoUnitario:fixed(total.div(base)),costoTotal:fixed(total)};
 }
 if(input.costoUnitario!==undefined){
  const perChosen=cost(input.costoUnitario);
  // Plain base-unit entry keeps today's exact behaviour: no total override.
  if(factor===null)return {cantidad:fixed(base),costoUnitario:fixed(perChosen)};
  return {cantidad:fixed(base),costoUnitario:fixed(perChosen.div(f)),
   costoTotal:fixed(perChosen.mul(typed))};
 }
 return {cantidad:fixed(base)};
}

/** «2 L × Q20.00» / «2 Garrafa 5 galón, total Q40.00»: kept on the movement note. */
export function entryDetail(input:EntryInput,unitName:string|null):string|null{
 if(!unitName)return null;
 const n=new Prisma.Decimal(input.cantidad).toString();
 if(input.costoTotal!==undefined)
  return `Ingresado: ${n} ${unitName}, total Q${new Prisma.Decimal(input.costoTotal).toFixed(2)}`;
 if(input.costoUnitario!==undefined)
  return `Ingresado: ${n} ${unitName} × Q${new Prisma.Decimal(input.costoUnitario).toFixed(2)}`;
 return `Ingresado: ${n} ${unitName}`;
}
