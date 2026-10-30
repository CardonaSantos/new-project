import {BadRequestException,ForbiddenException,Injectable,NotFoundException,PayloadTooLargeException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {operationalDate} from '../../../payments/domain/payment.policy.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import {resolvePeriod,ensurePage} from '../../domain/report-period.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {TicketQuery,ConsolidatedQuery} from '../../application/contracts/reporting.types.js';
import {salesCostAttribution} from './sales-cost-attribution.js';
import {orderCostOutcomes} from './order-cost-outcomes.js';
import {paymentSalesReconciliation,supplierBalances,platformSettlements,bankMatchStatus} from './financial-reconciliation.js';
import {financialBranchRollup} from './branch-rollup.js';
import {DomainReportsPort,type ReportSource} from '../../application/ports/domain-reports.port.js';

type Tx=Prisma.TransactionClient;
const decimal=(x:Prisma.Decimal|null|undefined)=>x?.toString()??'0';
const money=(x:Prisma.Decimal|null|undefined)=>x?.toFixed(2)??'0.00';
const meta=(page:number,limit:number,total:number)=>({page,limit,total,totalPages:Math.ceil(total/limit)});
const permissions:Record<ReportSource,string>={
 SALES_LINES:'sales.read',INVENTORY_MOVEMENTS:'inventory.reports.read',
 PURCHASE_INVOICES:'purchases.read',PURCHASE_RECEIPT_LINES:'purchases.read',
 DELIVERY_EVENTS:'delivery.read',RESERVATION_EVENTS:'reservations.read',
 SUPPLY_REQUESTS:'supply.read',SUPPLY_TRANSFERS:'supply.read',
 PREPARATION_COSTS:'inventory.costs.read',SALES_COSTS:'sales.read',
 ORDER_COST_OUTCOMES:'inventory.costs.read',
 PAYMENT_SALES_RECON:'payments.read',SUPPLIER_BALANCES:'purchases.read',
 PLATFORM_SETTLEMENTS:'delivery.platform.manage',BANK_MATCH_STATUS:'finance.statements.read'
};
@Injectable()
export class DomainReportsStore extends DomainReportsPort{
 constructor(private readonly db:PrismaService){super();}
 private read<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
  return this.db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20000});
 }
 private async context(tx:Tx,u:Principal,kind:ReportSource,q:TicketQuery){
  const branch=await tx.sucursal.findUnique({where:{id:q.sucursalId},
   include:{configuracionSucursalesComoSucursal:true}});
  for(const code of ['reports.read',permissions[kind],
   ...(kind==='SALES_COSTS'?['inventory.costs.read']:[]),
   ...(kind==='ORDER_COST_OUTCOMES'?['orders.read']:[])]){
   const allowed=await tx.usuarioRol.findFirst({where:{
    usuarioId:u.id,usuario:{activo:true},OR:[
     {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
      rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
     {sucursalId:q.sucursalId,rol:{activo:true,alcance:'SUCURSAL',
      rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}]
   },select:{id:true}});
   if(!allowed)throw new ForbiddenException('Permiso '+code+' insuficiente');
  }
  if(!branch?.activa)throw new NotFoundException('Sucursal no disponible');
  const corte=branch.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00';
  const zonaHoraria=branch.zonaHoraria;
  const today=operationalDate(new Date(),zonaHoraria,corte).toISOString().slice(0,10);
  const days=resolvePeriod(q,today);
  return {id:branch.id,nombre:branch.nombre,moneda:branch.configuracionSucursalesComoSucursal?.moneda??'GTQ',
   zonaHoraria,corte,desde:days.desde,hasta:days.hasta,
   from:financialBusinessWindow(days.desde,zonaHoraria,corte).from,
   to:financialBusinessWindow(days.hasta,zonaHoraria,corte).to};
 }
 async consolidated(u:Principal,q:ConsolidatedQuery){
  const ids=q.sucursalIds.split(',');
  if(ids.length<1||ids.length>10||ids.some(id=>!id||!/^[a-zA-Z0-9_-]+$/.test(id))||
   new Set(ids).size!==ids.length)
   throw new BadRequestException('sucursalIds requiere 1 a 10 IDs únicos');
  return this.read(async tx=>{
   const scopes=[];
   for(const id of ids){
    const b=await this.context(tx,u,'SALES_LINES',{...q,sucursalId:id,page:1,limit:1});
    // Explicit payments permission: users with sales-only roles cannot infer cash.
    const authorized=await tx.usuarioRol.findFirst({where:{
     usuarioId:u.id,usuario:{activo:true},OR:[
      {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
       rolPermisosComoRol:{some:{permiso:{codigo:'payments.read'}}}}},
      {sucursalId:id,rol:{activo:true,alcance:'SUCURSAL',
       rolPermisosComoRol:{some:{permiso:{codigo:'payments.read'}}}}}]
    },select:{id:true}});
    if(!authorized)throw new ForbiddenException('Permiso payments.read insuficiente');
    scopes.push(b);
   }
   return {source:'BRANCH_ROLLUP',generatedAt:new Date().toISOString(),
    sucursalesSolicitadas:ids.length,
    ...await financialBranchRollup(tx,scopes)};
  });
 }
 async records(u:Principal,kind:ReportSource,q:TicketQuery){
  ensurePage(q.page,q.limit);
  return this.read(tx=>this.recordsInTx(tx,u,kind,q));
 }
 async exportRecords(u:Principal,kind:ReportSource,q:TicketQuery){
  // All export pages are fetched inside ONE PostgreSQL RepeatableRead snapshot.
  // Do not silently truncate reports; the caller must narrow overly large periods.
  return this.db.$transaction(async tx=>{
   const limit=100,max=1000;
   const first=await this.recordsInTx(tx,u,kind,{...q,page:1,limit}) as
    {data:Record<string,unknown>[];meta:{total:number};[key:string]:unknown};
   if(!Array.isArray(first.data)||!Number.isSafeInteger(first.meta?.total))
    throw new ConflictException('Fuente no compatible con exportación tabular');
   const total=first.meta.total;
   if(total>max)throw new PayloadTooLargeException('Máximo 1000 registros por exportación; reduzca período');
   const data=[...first.data];
   for(let page=2;page<=Math.ceil(total/limit);page++){
    const chunk=await this.recordsInTx(tx,u,kind,{...q,page,limit}) as
     {data:Record<string,unknown>[];meta:{total:number}};
    if(chunk.meta?.total!==total||!Array.isArray(chunk.data))
     throw new ConflictException('Cambió la cantidad de registros al exportar');
    data.push(...chunk.data);
   }
   if(data.length!==total)
    throw new ConflictException('Datos incompletos; reintente exportación');
   return {...first,data,meta:{page:1,limit:total,total,totalPages:total?1:0},
    exportacion:{registros:total,limite:max,scope:'COMPLETO',snapshot:'REPEATABLE_READ'}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000});
 }
 private async recordsInTx(tx:Tx,u:Principal,kind:ReportSource,q:TicketQuery):Promise<unknown>{
   const b=await this.context(tx,u,kind,q),span={gte:b.from,lt:b.to};
   const skip=(q.page-1)*q.limit,take=q.limit;
   const header={source:kind,sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,
    periodo:{desde:b.desde,hasta:b.hasta,zonaHoraria:b.zonaHoraria,corte:b.corte},
    generatedAt:new Date().toISOString()};
   switch(kind){
    case 'SALES_LINES':{
     const where:Prisma.VentaLineaWhereInput={venta:{sucursalId:b.id,cerradaEn:span}};
     const [rows,total,totals,porProducto,porCategoria,porVariante,porModalidad]=await Promise.all([
      tx.ventaLinea.findMany({where,skip,take,
       orderBy:[{venta:{cerradaEn:'asc'}},{id:'asc'}],
       select:{id:true,ventaId:true,ordenLineaId:true,descripcion:true,
        cantidad:true,precioUnitario:true,descuento:true,subtotal:true,
        venta:{select:{numero:true,cerradaEn:true,cuenta:{select:{id:true,orden:{select:{id:true,numero:true}}}}}},
        ordenLinea:{select:{variante:{select:{id:true,nombre:true,
         producto:{select:{id:true,nombre:true,categoriaId:true}}}}}}}}),
      tx.ventaLinea.count({where}),
      tx.ventaLinea.aggregate({where,_sum:{subtotal:true,descuento:true,cantidad:true}}),
      tx.$queryRaw<Array<{productoId:string;nombre:string;categoriaId:string|null;
       unidades:string;importe:string;descuentos:string}>>`
       SELECT vp."productoId" AS "productoId", pr.nombre, pr."categoriaId" AS "categoriaId",
        COALESCE(SUM(vl.cantidad),0)::text AS unidades,
        COALESCE(SUM(vl.subtotal),0)::text AS importe,
        COALESCE(SUM(vl.descuento),0)::text AS descuentos
       FROM "VentaLinea" vl
        JOIN "Venta" v ON v.id=vl."ventaId"
        JOIN "OrdenLinea" ol ON ol.id=vl."ordenLineaId"
        JOIN "VarianteProducto" vp ON vp.id=ol."varianteId"
        JOIN "Producto" pr ON pr.id=vp."productoId"
       WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${b.from}
        AND v."cerradaEn"<${b.to}
       GROUP BY vp."productoId",pr.nombre,pr."categoriaId"
       ORDER BY SUM(vl.subtotal) DESC,vp."productoId"`,
      tx.$queryRaw<Array<{categoriaId:string|null;categoria:string|null;
       unidades:string;importe:string;descuentos:string}>>`
       SELECT pr."categoriaId" AS "categoriaId",ca.nombre AS categoria,
        COALESCE(SUM(vl.cantidad),0)::text AS unidades,
        COALESCE(SUM(vl.subtotal),0)::text AS importe,
        COALESCE(SUM(vl.descuento),0)::text AS descuentos
       FROM "VentaLinea" vl
        JOIN "Venta" v ON v.id=vl."ventaId"
        JOIN "OrdenLinea" ol ON ol.id=vl."ordenLineaId"
        JOIN "VarianteProducto" vp ON vp.id=ol."varianteId"
        JOIN "Producto" pr ON pr.id=vp."productoId"
        LEFT JOIN "Categoria" ca ON ca.id=pr."categoriaId"
       WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${b.from}
        AND v."cerradaEn"<${b.to}
       GROUP BY pr."categoriaId",ca.nombre
       ORDER BY SUM(vl.subtotal) DESC,pr."categoriaId"`,
      tx.$queryRaw<Array<{varianteId:string;variante:string;productoId:string;
       producto:string;unidades:string;importe:string;descuentos:string}>>`
       SELECT vp.id AS "varianteId",vp.nombre AS variante,
        pr.id AS "productoId",pr.nombre AS producto,
        COALESCE(SUM(vl.cantidad),0)::text AS unidades,
        COALESCE(SUM(vl.subtotal),0)::text AS importe,
        COALESCE(SUM(vl.descuento),0)::text AS descuentos
       FROM "VentaLinea" vl
        JOIN "Venta" v ON v.id=vl."ventaId"
        JOIN "OrdenLinea" ol ON ol.id=vl."ordenLineaId"
        JOIN "VarianteProducto" vp ON vp.id=ol."varianteId"
        JOIN "Producto" pr ON pr.id=vp."productoId"
       WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${b.from}
        AND v."cerradaEn"<${b.to}
       GROUP BY vp.id,vp.nombre,pr.id,pr.nombre
       ORDER BY SUM(vl.subtotal) DESC,vp.id`,
      tx.$queryRaw<Array<{modalidad:string;unidades:string;importe:string;descuentos:string}>>`
       SELECT o.modalidad::text AS modalidad,
        COALESCE(SUM(vl.cantidad),0)::text AS unidades,
        COALESCE(SUM(vl.subtotal),0)::text AS importe,
        COALESCE(SUM(vl.descuento),0)::text AS descuentos
       FROM "VentaLinea" vl
        JOIN "Venta" v ON v.id=vl."ventaId"
        JOIN "Cuenta" c ON c.id=v."cuentaId"
        JOIN "Orden" o ON o.id=c."ordenId"
       WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${b.from}
        AND v."cerradaEn"<${b.to}
       GROUP BY o.modalidad
       ORDER BY SUM(vl.subtotal) DESC,o.modalidad`
     ]);
     return {...header,totales:{registros:total,importeLineas:money(totals._sum.subtotal),
      descuentos:money(totals._sum.descuento),unidades:decimal(totals._sum.cantidad)},
      porProducto,porCategoria,porVariante,porModalidad,
      data:rows.map(x=>({id:x.id,ventaId:x.ventaId,numeroVenta:x.venta.numero,
       fecha:x.venta.cerradaEn,cuentaId:x.venta.cuenta.id,
       ordenId:x.venta.cuenta.orden.id,numeroOrden:x.venta.cuenta.orden.numero,
       ordenLineaId:x.ordenLineaId,producto:x.ordenLinea.variante.producto,
       varianteId:x.ordenLinea.variante.id,variante:x.ordenLinea.variante.nombre,
       descripcion:x.descripcion,cantidad:decimal(x.cantidad),
       precioUnitario:money(x.precioUnitario),descuento:money(x.descuento),
       subtotal:money(x.subtotal)})),
      meta:meta(q.page,q.limit,total)};
    }
    case 'PAYMENT_SALES_RECON':{
     return {...header,...await paymentSalesReconciliation(tx,b,q.page,q.limit)};
    }
    case 'SUPPLIER_BALANCES':{
     return {...header,...await supplierBalances(tx,b,q.page,q.limit)};
    }
    case 'PLATFORM_SETTLEMENTS':{
     return {...header,...await platformSettlements(tx,b,q.page,q.limit)};
    }
    case 'BANK_MATCH_STATUS':{
     return {...header,...await bankMatchStatus(tx,b,q.page,q.limit)};
    }
    case 'ORDER_COST_OUTCOMES':{
     return {...header,...await orderCostOutcomes(tx,b,q.page,q.limit)};
    }
    case 'SALES_COSTS':{
     return {...header,...await salesCostAttribution(tx,b,q.page,q.limit)};
    }
    case 'PREPARATION_COSTS':{
     // A consumption-date ledger; not a sale-date margin or a double-counted expense.
     const where:Prisma.ConsumoOrdenWhereInput={orden:{sucursalId:b.id},creadoEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.consumoOrden.findMany({where,skip,take,
       orderBy:[{creadoEn:'asc'},{id:'asc'}],
       include:{
        orden:{select:{id:true,numero:true,modalidad:true,estado:true}},
        ordenLinea:{select:{id:true,nombreSnapshot:true,
         variante:{select:{id:true,nombre:true,
          producto:{select:{id:true,nombre:true}}}}}},
        consumoOrdenLineasComoConsumo:{orderBy:{id:'asc'},
         include:{articulo:{select:{id:true,codigo:true,nombre:true}},
          movimiento:{select:{id:true,creadoEn:true,tipo:true,cantidad:true,
           articuloId:true,ubicacionId:true,loteId:true,
           costoTotal:true,referenciaTipo:true,referenciaId:true}}}}
       }}),
      tx.consumoOrden.count({where}),
      tx.$queryRaw<Array<{tipo:string;documentos:number;lineas:number;
       lineasSinMovimiento:number;documentosSinLineas:number;costoRegistrado:string}>>`
       SELECT co.tipo::text AS tipo,
        COUNT(DISTINCT co.id)::int AS documentos,
        COUNT(cl.id)::int AS lineas,
        COUNT(cl.id) FILTER (WHERE mi.id IS NULL)::int AS "lineasSinMovimiento",
        COUNT(DISTINCT co.id) FILTER (WHERE cl.id IS NULL)::int AS "documentosSinLineas",
        COALESCE(SUM(mi."costoTotal"),0)::text AS "costoRegistrado"
       FROM "ConsumoOrden" co
        JOIN "Orden" o ON o.id=co."ordenId"
        LEFT JOIN "ConsumoOrdenLinea" cl ON cl."consumoId"=co.id
        LEFT JOIN "MovimientoInventario" mi ON mi.id=cl."movimientoId"
         AND mi.tipo='CONSUMO' AND mi."referenciaTipo"='CONSUMO_ORDEN'
         AND mi."referenciaId"=co.id AND mi."articuloId"=cl."articuloId"
         AND mi."ubicacionId"=cl."ubicacionId"
         AND mi."loteId" IS NOT DISTINCT FROM cl."loteId"
       WHERE o."sucursalId"=${b.id} AND co."creadoEn">=${b.from}
        AND co."creadoEn"<${b.to}
       GROUP BY co.tipo ORDER BY co.tipo`
     ]);
     const categories=groups.map(g=>({tipo:g.tipo,documentos:g.documentos,
      lineas:g.lineas,lineasSinMovimiento:g.lineasSinMovimiento,
      documentosSinLineas:g.documentosSinLineas,
      costoRegistrado:new Prisma.Decimal(g.costoRegistrado).toFixed(6)}));
     const sum=(field:'lineas'|'lineasSinMovimiento'|'documentosSinLineas')=>
      categories.reduce((n,c)=>n+c[field],0);
     const totalCost=categories.reduce((n,c)=>n.plus(c.costoRegistrado),
      new Prisma.Decimal(0));
     return {...header,totales:{documentos:total,lineas:sum('lineas'),
      lineasSinMovimiento:sum('lineasSinMovimiento'),
      documentosSinLineas:sum('documentosSinLineas'),
      costoRegistrado:totalCost.toFixed(6),porTipo:categories},
      data:rows.map(doc=>{
       const lineas=doc.consumoOrdenLineasComoConsumo.map(l=>{
        const m=l.movimiento;
        const trazabilidadValida=!!m&&m.tipo==='CONSUMO'&&
         m.referenciaTipo==='CONSUMO_ORDEN'&&m.referenciaId===doc.id&&
         m.articuloId===l.articuloId&&m.ubicacionId===l.ubicacionId&&
         m.loteId===l.loteId;
        return {id:l.id,articulo:l.articulo,ubicacionId:l.ubicacionId,
         loteId:l.loteId,cantidad:decimal(l.cantidad),
         costoUnitarioHistorico:decimal(l.costoUnitario),
         movimientoId:l.movimientoId,trazabilidadValida,
         costoMovimiento:trazabilidadValida?m!.costoTotal.toFixed(6):null,
         movimiento:m?{id:m.id,fecha:m.creadoEn,tipo:m.tipo,
          cantidad:decimal(m.cantidad),costoTotal:decimal(m.costoTotal),
          articuloId:m.articuloId,ubicacionId:m.ubicacionId,loteId:m.loteId,
          referenciaTipo:m.referenciaTipo,referenciaId:m.referenciaId}:null};
       });
       const completo=lineas.length>0&&lineas.every(l=>l.trazabilidadValida);
       const costo=completo?lineas.reduce((n,l)=>n.plus(l.costoMovimiento!),
        new Prisma.Decimal(0)).toFixed(6):null;
       return {id:doc.id,fecha:doc.creadoEn,tipo:doc.tipo,
        orden:doc.orden,ordenLinea:doc.ordenLinea,comandaLineaId:doc.comandaLineaId,
        recetaVersionId:doc.recetaVersionId,
        cantidadPreparada:doc.cantidadPreparada?decimal(doc.cantidadPreparada):null,
        costoRegistrado:costo,trazabilidadCompleta:completo,lineas};
      }),meta:meta(q.page,q.limit,total)};
    }
    case 'INVENTORY_MOVEMENTS':{
     const where:Prisma.MovimientoInventarioWhereInput={
      ubicacion:{almacen:{sucursalId:b.id}},creadoEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.movimientoInventario.findMany({where,skip,take,
       orderBy:[{creadoEn:'asc'},{id:'asc'}],
       include:{articulo:{select:{id:true,codigo:true,nombre:true}},
        ubicacion:{select:{id:true,codigo:true,nombre:true,
         almacen:{select:{id:true,codigo:true,nombre:true}}}},
        usuario:{select:{id:true,nombre:true}}}}),
      tx.movimientoInventario.count({where}),
      tx.movimientoInventario.groupBy({by:['tipo'],where,_sum:{costoTotal:true},_count:{id:true}})
     ]);
     return {...header,totales:{registros:total,porTipo:groups.map(x=>({
      tipo:x.tipo,cantidad:x._count.id,costoRegistrado:decimal(x._sum.costoTotal)}))},
      data:rows.map(x=>({id:x.id,fecha:x.creadoEn,tipo:x.tipo,articulo:x.articulo,
       ubicacion:x.ubicacion,usuario:x.usuario,loteId:x.loteId,
       costoUnitario:decimal(x.costoUnitario),costoTotal:decimal(x.costoTotal),
       referenciaTipo:x.referenciaTipo,referenciaId:x.referenciaId,claveOperacion:x.claveOperacion})),
      meta:meta(q.page,q.limit,total)};
    }
    case 'PURCHASE_INVOICES':{
     const where:Prisma.FacturaProveedorWhereInput={sucursalId:b.id,creadaEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.facturaProveedor.findMany({where,skip,take,
       orderBy:[{creadaEn:'asc'},{id:'asc'}],
       include:{proveedor:{select:{id:true,nombre:true,nit:true}}}}),
      tx.facturaProveedor.count({where}),
      tx.facturaProveedor.groupBy({by:['estado'],where,
       _sum:{total:true,subtotal:true,impuestos:true},_count:{id:true}})
     ]);
     return {...header,totales:{registros:total,porEstado:groups.map(x=>({
      estado:x.estado,cantidad:x._count.id,totalDocumentos:money(x._sum.total),
      subtotal:money(x._sum.subtotal),impuestos:money(x._sum.impuestos)}))},
      data:rows.map(x=>({id:x.id,numeroDocumento:x.numeroDocumento,
       referenciaFiscal:x.referenciaFiscal,proveedor:x.proveedor,estado:x.estado,
       fechaEmision:x.fechaEmision,creadaEn:x.creadaEn,confirmadaEn:x.confirmadaEn,
       anuladaEn:x.anuladaEn,subtotal:money(x.subtotal),
       impuestos:money(x.impuestos),total:money(x.total)})),
      meta:meta(q.page,q.limit,total)};
    }
    case 'PURCHASE_RECEIPT_LINES':{
     const where:Prisma.RecepcionCompraLineaWhereInput={recepcion:{
      almacen:{sucursalId:b.id},estado:'CONFIRMADO',recibidoEn:span}};
     const [rows,total,sum]=await Promise.all([
      tx.recepcionCompraLinea.findMany({where,skip,take,
       orderBy:[{recepcion:{recibidoEn:'asc'}},{id:'asc'}],
       select:{id:true,articuloId:true,loteId:true,ubicacionId:true,
        movimientoId:true,cantidadBase:true,cantidadCompra:true,
        costoTotal:true,precioUnitarioCompra:true,importeImpuesto:true,
        articulo:{select:{codigo:true,nombre:true}},
        recepcion:{select:{id:true,numero:true,recibidoEn:true,estado:true,
         proveedor:{select:{id:true,nombre:true}},ordenCompraId:true}}}}),
      tx.recepcionCompraLinea.count({where}),
      tx.recepcionCompraLinea.aggregate({where,_sum:{costoTotal:true,importeImpuesto:true}})
     ]);
     return {...header,totales:{registros:total,
      costoRegistrado:money(sum._sum.costoTotal),impuestosRegistrados:money(sum._sum.importeImpuesto)},
      data:rows.map(x=>({id:x.id,recepcion:x.recepcion,articuloId:x.articuloId,
       articulo:x.articulo,ubicacionId:x.ubicacionId,loteId:x.loteId,
       movimientoInventarioId:x.movimientoId,cantidadCompra:decimal(x.cantidadCompra),
       cantidadBase:decimal(x.cantidadBase),precioUnitarioCompra:decimal(x.precioUnitarioCompra),
       impuesto:money(x.importeImpuesto),costoTotal:money(x.costoTotal)})),
      meta:meta(q.page,q.limit,total)};
    }
    case 'DELIVERY_EVENTS':{
     const where:Prisma.EntregaEventoWhereInput={entrega:{orden:{sucursalId:b.id}},creadoEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.entregaEvento.findMany({where,skip,take,
       orderBy:[{creadoEn:'asc'},{id:'asc'}],
       include:{usuario:{select:{id:true,nombre:true}},
        entrega:{select:{id:true,estado:true,orden:{select:{id:true,numero:true}},
         repartidor:{select:{id:true,nombre:true}},canalExternoId:true}}}}),
      tx.entregaEvento.count({where}),
      tx.entregaEvento.groupBy({by:['accion','estadoDespues'],where,_count:{id:true}})
     ]);
     return {...header,totales:{eventos:total,porAccion:groups.map(x=>({
      accion:x.accion,estadoDespues:x.estadoDespues,cantidad:x._count.id}))},
      data:rows.map(x=>({id:x.id,fecha:x.creadoEn,accion:x.accion,
       estadoAntes:x.estadoAntes,estadoDespues:x.estadoDespues,actor:x.usuario,
       motivo:x.motivo,entrega:x.entrega})),meta:meta(q.page,q.limit,total)};
    }
    case 'RESERVATION_EVENTS':{
     const where:Prisma.EventoReservaWhereInput={reserva:{sucursalId:b.id},creadoEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.eventoReserva.findMany({where,skip,take,
       orderBy:[{creadoEn:'asc'},{id:'asc'}],
       include:{usuario:{select:{id:true,nombre:true}},
        reserva:{select:{id:true,estado:true,personas:true,inicio:true,fin:true}}}}),
      tx.eventoReserva.count({where}),
      tx.eventoReserva.groupBy({by:['accion'],where,_count:{id:true}})
     ]);
     return {...header,totales:{eventos:total,porAccion:groups.map(x=>({
      accion:x.accion,cantidad:x._count.id}))},
      data:rows.map(x=>({id:x.id,fecha:x.creadoEn,accion:x.accion,
       detalle:x.detalle,actor:x.usuario,reserva:x.reserva})),meta:meta(q.page,q.limit,total)};
    }
    case 'SUPPLY_REQUESTS':{
     const where:Prisma.RequisicionWhereInput={almacenDestino:{sucursalId:b.id},creadaEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.requisicion.findMany({where,skip,take,
       orderBy:[{creadaEn:'asc'},{id:'asc'}],
       include:{almacenDestino:{select:{id:true,nombre:true}},
        solicitante:{select:{id:true,nombre:true}},
        requisicionLineasComoRequisicion:{select:{id:true,articuloId:true,
         cantidadSolicitada:true,cantidadAtendida:true}}}}),
      tx.requisicion.count({where}),
      tx.requisicion.groupBy({by:['estado'],where,_count:{id:true}})
     ]);
     return {...header,totales:{requisiciones:total,porEstado:groups.map(x=>({
      estado:x.estado,cantidad:x._count.id}))},
      data:rows.map(x=>({id:x.id,numero:x.numero,estado:x.estado,
       fecha:x.creadaEn,atendidaEn:x.atendidaEn,almacenDestino:x.almacenDestino,
       solicitante:x.solicitante,lineas:x.requisicionLineasComoRequisicion.map(l=>({
        id:l.id,articuloId:l.articuloId,cantidadSolicitada:decimal(l.cantidadSolicitada),
        cantidadAtendida:decimal(l.cantidadAtendida)}))})),meta:meta(q.page,q.limit,total)};
    }
    case 'SUPPLY_TRANSFERS':{
     const where:Prisma.TransferenciaInventarioWhereInput={
      almacenOrigen:{sucursalId:b.id},despachadaEn:span};
     const [rows,total,groups]=await Promise.all([
      tx.transferenciaInventario.findMany({where,skip,take,
       orderBy:[{despachadaEn:'asc'},{id:'asc'}],
       include:{almacenOrigen:{select:{id:true,nombre:true}},
        almacenDestino:{select:{id:true,nombre:true}},
        usuario:{select:{id:true,nombre:true}},
        transferenciaInventarioLineasComoTransferencia:{select:{
         id:true,articuloId:true,cantidadEnviada:true,cantidadRecibida:true,costoEnTransito:true}}}}),
      tx.transferenciaInventario.count({where}),
      tx.transferenciaInventario.groupBy({by:['estado'],where,_count:{id:true}})
     ]);
     return {...header,totales:{despachos:total,porEstadoActual:groups.map(x=>({
      estado:x.estado,cantidad:x._count.id}))},
      data:rows.map(x=>({id:x.id,numero:x.numero,estado:x.estado,
       despachadaEn:x.despachadaEn,recibidaEn:x.recibidaEn,
       almacenOrigen:x.almacenOrigen,almacenDestino:x.almacenDestino,
       usuario:x.usuario,lineas:x.transferenciaInventarioLineasComoTransferencia.map(l=>({
        id:l.id,articuloId:l.articuloId,cantidadEnviada:decimal(l.cantidadEnviada),
        cantidadRecibida:l.cantidadRecibida?decimal(l.cantidadRecibida):null,
        costoEnTransito:l.costoEnTransito?decimal(l.costoEnTransito):null}))})),
      meta:meta(q.page,q.limit,total)};
    }
   }
 }
}
