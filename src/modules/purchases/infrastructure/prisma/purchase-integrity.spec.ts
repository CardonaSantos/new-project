import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import type {Actor} from './purchase-shared.js';
import {PurchaseInvoicesStore} from './purchase-invoices.store.js';
import {PurchaseReturnsStore} from './purchase-returns.store.js';

const actor={id:'usuario-1'} as Actor;
const amount=(v:string)=>new Prisma.Decimal(v);
function invoiceTestContext(lines:Array<{recepcionLineaId:string|null;cantidad:Prisma.Decimal}>,
 confirmedAmount:string,acceptedAmount='1'){
 const tx={
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'permiso-global'})},
  facturaProveedor:{findUnique:vi.fn().mockResolvedValue({id:'factura-1',
   sucursalId:'sucursal-1',estado:'BORRADOR'}),
   update:vi.fn().mockResolvedValue({id:'factura-1'})},
  facturaProveedorLinea:{
   findMany:vi.fn().mockResolvedValue(lines),
   aggregate:vi.fn().mockResolvedValue({_sum:{cantidad:amount(confirmedAmount)}}),
  },
  recepcionCompraLinea:{findUnique:vi.fn().mockResolvedValue({
   id:'linea-1',cantidadCompra:amount(acceptedAmount),recepcion:{estado:'CONFIRMADO'}})},
  operacionIdempotente:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({})},
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})},
 };
 const db={$transaction:vi.fn().mockImplementation(async(fn:(t:unknown)=>unknown)=>fn(tx))};
 return {store:new PurchaseInvoicesStore(db as unknown as PrismaService),tx};
}
describe('PUR-A invoice receipt coverage',()=>{
 it('rejects a second confirmed invoice that exceeds the accepted delivery',async()=>{
  const {store,tx}=invoiceTestContext([{recepcionLineaId:'linea-1',cantidad:amount('1')}],'1');
  await expect(store.confirm(actor,'factura-1',{claveOperacion:'PUR:INV:DUPLICATE:001'}))
   .rejects.toThrow('Cantidad facturada excede lo aceptado');
  expect(tx.facturaProveedor.update).not.toHaveBeenCalled();
  expect(tx.facturaProveedorLinea.aggregate).toHaveBeenCalledWith({
   where:{recepcionLineaId:'linea-1',factura:{estado:'CONFIRMADA'}},_sum:{cantidad:true}});
 });
 it('rejects two lines in the same invoice that together exceed one receipt',async()=>{
  const {store,tx}=invoiceTestContext([
   {recepcionLineaId:'linea-1',cantidad:amount('0.6')},
   {recepcionLineaId:'linea-1',cantidad:amount('0.6')}],
  '0');
  await expect(store.confirm(actor,'factura-1',{claveOperacion:'PUR:INV:DUPLICATE:002'}))
   .rejects.toThrow('Cantidad facturada excede lo aceptado');
  expect(tx.facturaProveedor.update).not.toHaveBeenCalled();
 });
 it('allows partial invoice up to the remainder and leaves stock unchanged',async()=>{
  const {store,tx}=invoiceTestContext([{recepcionLineaId:'linea-1',cantidad:amount('0.4')}],'0.6');
  await expect(store.confirm(actor,'factura-1',{claveOperacion:'PUR:INV:PARTIAL:003'}))
   .resolves.toEqual({id:'factura-1',estado:'CONFIRMADA'});
  expect(tx.facturaProveedor.update).toHaveBeenCalledOnce();
 });
 it('allows supplier service invoices without physical receipt references',async()=>{
  const {store,tx}=invoiceTestContext([{recepcionLineaId:null,cantidad:amount('2')}],'0');
  await expect(store.confirm(actor,'factura-1',{claveOperacion:'PUR:INV:SERVICE:004'}))
   .resolves.toEqual({id:'factura-1',estado:'CONFIRMADA'});
  expect(tx.recepcionCompraLinea.findUnique).not.toHaveBeenCalled();
 });
});
describe('PUR-A supplier credit tax snapshots',()=>{
 function setup(){
  const tx={
   usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'global'})},
   proveedor:{findUnique:vi.fn().mockResolvedValue({id:'proveedor-1'})},
   notaCreditoProveedor:{create:vi.fn().mockImplementation(async({data}:{data:unknown})=>({id:'credito-1',...data as object}))},
   eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
   eventoOutbox:{create:vi.fn().mockResolvedValue({})},
  };
  const db={$transaction:vi.fn().mockImplementation(async(fn:(t:unknown)=>unknown)=>fn(tx))};
  const store=new PurchaseReturnsStore(db as unknown as PrismaService,
   {} as InventoryPostingEngine,{} as CashStore);
  const base={proveedorId:'proveedor-1',sucursalId:'sucursal-1',
   numeroDocumento:'NC-001',motivo:'Ajuste comercial acordado',total:'7.40'};
  return {tx,store,base};
 }
 it('preserves prior commercial credit behavior when no taxes are declared',async()=>{
  const {store,tx,base}=setup();
  await store.createCredit(actor,base);
  const data=tx.notaCreditoProveedor.create.mock.calls[0][0].data;
  expect(data.subtotal.toFixed(2)).toBe('7.40');
  expect(data.impuestos.toFixed(2)).toBe('0.00');
  expect(data.total.toFixed(2)).toBe('7.40');
 });
 it('persists explicit taxable credit components accurately',async()=>{
  const {store,tx,base}=setup();
  await store.createCredit(actor,{...base,impuestos:'2.40'});
  const data=tx.notaCreditoProveedor.create.mock.calls[0][0].data;
  expect(data.subtotal.toFixed(2)).toBe('5.00');
  expect(data.impuestos.toFixed(2)).toBe('2.40');
  expect(data.total.toFixed(2)).toBe('7.40');
 });
 it('rejects credits where taxes reach or exceed the gross amount',async()=>{
  const {store,tx,base}=setup();
  await expect(store.createCredit(actor,{...base,impuestos:'7.40'})).rejects.toThrow(
   'Impuesto debe ser menor que el total');
  expect(tx.notaCreditoProveedor.create).not.toHaveBeenCalled();
 });
});
