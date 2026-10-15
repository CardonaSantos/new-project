import {Prisma} from '../../../../generated/prisma/client.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {bookKey} from '../../domain/inventory-valuation.policy.js';

// Sum signed movement amounts in PostgreSQL (not the rounded unit-average
// column). Both readers and postings use the same six-decimal money ledger.
export async function locationBookValue(
 tx:Prisma.TransactionClient,articuloId:string,ubicacionId:string):Promise<Prisma.Decimal>{
 const rows=await tx.$queryRaw<Array<{valor:Prisma.Decimal}>>`
  SELECT COALESCE(SUM(CASE WHEN "cantidad" < 0
   THEN -"costoTotal" ELSE "costoTotal" END),0) AS "valor"
  FROM "MovimientoInventario"
  WHERE "articuloId"=${articuloId} AND "ubicacionId"=${ubicacionId}
 `;
 return new Prisma.Decimal(rows[0]?.valor??0);
}

export async function locationBookValues(
 db:PrismaService,locationIds:string[]):Promise<Map<string,Prisma.Decimal>>{
 const books=new Map<string,Prisma.Decimal>();
 if(!locationIds.length)return books;
 const rows=await db.$queryRaw<Array<{
  articuloId:string;ubicacionId:string;valor:Prisma.Decimal
 }>>`
  SELECT "articuloId","ubicacionId",
   SUM(CASE WHEN "cantidad" < 0 THEN -"costoTotal" ELSE "costoTotal" END) AS "valor"
  FROM "MovimientoInventario"
  WHERE "ubicacionId" IN (${Prisma.join(locationIds)})
  GROUP BY "articuloId","ubicacionId"
 `;
 for(const row of rows)books.set(bookKey(row.articuloId,row.ubicacionId),new Prisma.Decimal(row.valor));
 return books;
}
