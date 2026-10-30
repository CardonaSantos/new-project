import {describe,expect,it,vi} from 'vitest';
import {DeliveryStore} from './delivery.store.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
const user:Principal={id:'admin',email:'admin@example.test',nombre:'Admin',sessionId:'s',
 versionAutorizacion:1,debeCambiarContrasena:false};
function rig(){
 const order={id:'order-1',numero:'ORD-1',sucursalId:'branch-1',clienteId:'client-1',
  modalidad:'DELIVERY',origen:'CAJA',estado:'ABIERTA',total:{toString:()=> '22'}};
 const row={id:'delivery-1',ordenId:'order-1',orden:order,estado:'PENDIENTE',repartidorId:null,
  repartidor:null,canalExternoId:null,canalExterno:null,referenciaExterna:null,
  direccionId:null,direccionTexto:'Zona 1, Calle 3',referenciaDireccion:null,
  telefonoContacto:null,costoEnvio:{toFixed:()=> '0.00'},
  cobrableContraEntrega:{toFixed:()=> '0.00'},enRepartoEn:null,entregadaEn:null,nota:null};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([]),
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'rol-1'})},
  sucursal:{findUnique:vi.fn().mockResolvedValue({activa:true})},
  orden:{findUnique:vi.fn().mockResolvedValue(order)},
  ordenLinea:{findMany:vi.fn().mockResolvedValue([{
   cantidad:{gt:()=>false},cantidadEnviada:{}
  }])},
  cuenta:{findMany:vi.fn().mockResolvedValue([{total:{eq:()=>true},pagado:{}}])},
  comanda:{count:vi.fn().mockResolvedValue(0)},
  pago:{count:vi.fn().mockResolvedValue(0)},
  entrega:{findUnique:vi.fn(async({where}:any)=>where.ordenId?null:row),
   create:vi.fn().mockResolvedValue({id:'delivery-1'}),
   update:vi.fn(async({data}:any)=>{Object.assign(row,data);return row;})},
  entregaEvento:{create:vi.fn().mockResolvedValue({}),findMany:vi.fn().mockResolvedValue([])},
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})},
  operacionIdempotente:{findUnique:vi.fn().mockResolvedValue(null),
   create:vi.fn().mockResolvedValue({})}
 };
 const db={$transaction:vi.fn(async run=>run(tx))} as unknown as PrismaService;
 const payments={settle:vi.fn().mockResolvedValue({closed:true})};
 return {store:new DeliveryStore(db,payments as never),tx,row,order,payments};
}
describe('DEL-A D2 transactional delivery',()=>{
 it('prevents courier-only users reading order account readiness',async()=>{
  const {store,tx,payments}=rig();
  tx.usuarioRol.findFirst.mockResolvedValueOnce(null);
  await expect(store.closureReadiness(user,'delivery-1')).rejects.toThrow('No puede gestionar');
  expect(tx.cuenta.findMany).not.toHaveBeenCalled();
  expect(payments.settle).not.toHaveBeenCalled();
 });
 it('blocks premature accounting close and explains missing readiness conditions',async()=>{
  const {store,tx,row,payments}=rig();
  const readiness=await store.closureReadiness(user,'delivery-1') as any;
  expect(readiness.canFinalize).toBe(false);
  expect(readiness.blockers).toContain('DELIVERY_NOT_COMPLETED');
  await expect(store.finalizeOrder(user,'delivery-1')).rejects.toThrow('Cierre bloqueado');
  expect(payments.settle).not.toHaveBeenCalled();
 });
 it('delegates a delivered paid and prepared order to PAY-A once',async()=>{
  const {store,tx,row,order,payments}=rig();
  row.estado='ENTREGADA';
  payments.settle.mockImplementation(async()=>{
   order.estado='CERRADA';
   return {orderId:order.id,closed:true};
  });
  const result=await store.finalizeOrder(user,'delivery-1') as any;
  expect(result.alreadyClosed).toBe(true);
  expect(payments.settle).toHaveBeenCalledExactlyOnceWith(user,order.id);
  expect(tx.eventoAuditoria.create).not.toHaveBeenCalled();
  await store.finalizeOrder(user,'delivery-1');
  expect(payments.settle).toHaveBeenCalledOnce();
 });
 it('does not close an unpaid delivery even if it is already ENTREGADA',async()=>{
  const {store,tx,row,payments}=rig();
  row.estado='ENTREGADA';
  tx.cuenta.findMany.mockResolvedValueOnce([{total:{eq:()=>false},pagado:{}}]);
  const readiness=await store.closureReadiness(user,'delivery-1') as any;
  expect(readiness.blockers).toContain('ACCOUNTS_UNPAID');
  expect(payments.settle).not.toHaveBeenCalled();
 });

 it('creates immediately assigned delivery without approval, cash or accounting writes',async()=>{
  const {store,tx,row}=rig();
  row.repartidorId='courier-1';
  const result=await store.create(user,{ordenId:'order-1',claveOperacion:'D2:CREATE:001',
   direccionTexto:'Zona 1, Calle 3',repartidorId:'courier-1'});
  expect(result).toMatchObject({id:'delivery-1',estado:'PENDIENTE',repartidorId:'courier-1'});
  expect(tx.entrega.create).toHaveBeenCalledWith({data:expect.objectContaining({
   ordenId:'order-1',repartidorId:'courier-1',direccionTexto:'Zona 1, Calle 3'
  })});
  expect(tx.entregaEvento.create).toHaveBeenCalledWith({data:expect.objectContaining({
   accion:'DELIVERY_CREATED',repartidorDespuesId:'courier-1'
  })});
  expect(tx.operacionIdempotente.create).toHaveBeenCalledOnce();
  expect(tx.eventoOutbox.create).toHaveBeenCalledOnce();
  expect((tx.eventoOutbox.create.mock.calls[0][0] as any).data.payload).not.toHaveProperty('direccionTexto');
 });
 it('rejects non-delivery orders with no side effects',async()=>{
  const {store,tx,order}=rig();
  order.modalidad='MOSTRADOR';
  await expect(store.create(user,{ordenId:'order-1',
   claveOperacion:'D2:INVALID:001',direccionTexto:'Calle principal, Zona 1'}))
   .rejects.toThrow('Solo se acepta orden DELIVERY');
  expect(tx.entrega.create).not.toHaveBeenCalled();
  expect(tx.operacionIdempotente.create).not.toHaveBeenCalled();
 });
 it('assigns the courier immediately in one committed operation without a second approver',async()=>{
  const {store,tx,row}=rig();
  const result=await store.assign(user,'delivery-1',{
   repartidorId:'courier-1',claveOperacion:'D2:DIRECT:001'
  });
  expect(result).toMatchObject({id:'delivery-1',repartidorId:'courier-1'});
  expect(row.repartidorId).toBe('courier-1');
  expect(tx.entrega.update).toHaveBeenCalledOnce();
  expect(tx.entregaEvento.create).toHaveBeenCalledWith({data:expect.objectContaining({
   accion:'DELIVERY_ASSIGNED',repartidorDespuesId:'courier-1'
  })});
  expect(tx.operacionIdempotente.create).toHaveBeenCalledOnce();
 });
 it('preserves phone and reference if only the destination text is changed',async()=>{
  const {store,tx,row}=rig();
  row.telefonoContacto='55550001';
  row.referenciaDireccion='Portón negro';
  const out=await store.destination(user,'delivery-1',{
   claveOperacion:'D2:DESTINATION:001',direccionTexto:'Zona 2, Avenida 5'
  });
  expect(out).toMatchObject({direccionTexto:'Zona 2, Avenida 5',
   telefonoContacto:'55550001',referenciaDireccion:'Portón negro'});
  expect(tx.entrega.update).toHaveBeenCalledWith({where:{id:'delivery-1'},data:
   expect.objectContaining({telefonoContacto:'55550001',referenciaDireccion:'Portón negro'})});
 });
 it('allows explicit null to clear contact fields',async()=>{
  const {store,tx,row}=rig();
  row.telefonoContacto='55550001';
  row.referenciaDireccion='Portón negro';
  await store.destination(user,'delivery-1',{
   claveOperacion:'D2:DESTINATION:CLEAR',direccionTexto:'Zona 2, Avenida 5',
   telefonoContacto:null,referenciaDireccion:null
  });
  expect(tx.entrega.update).toHaveBeenCalledWith({where:{id:'delivery-1'},data:
   expect.objectContaining({telefonoContacto:null,referenciaDireccion:null})});
 });
 it('prevents reassignment while the courier carries customer cash',async()=>{
  const {store,tx,row}=rig();
  row.repartidorId='courier-original';
  tx.pago.count.mockResolvedValueOnce(1);
  await expect(store.assign(user,'delivery-1',{
   repartidorId:'courier-new',claveOperacion:'D2:REASSIGN:CASH'
  })).rejects.toThrow('efectivo cobrado');
  expect(tx.entrega.update).not.toHaveBeenCalled();
 });
 it('checks manager before immediately assigning a courier',async()=>{
  const {store,tx}=rig();
  tx.usuarioRol.findFirst.mockResolvedValueOnce(null);
  await expect(store.assign(user,'delivery-1',{
   repartidorId:'courier-1',claveOperacion:'D2:ASSIGN:001'
  })).rejects.toThrow('No puede gestionar');
  expect(tx.entrega.update).not.toHaveBeenCalled();
  expect(tx.operacionIdempotente.findUnique).not.toHaveBeenCalled();
 });
 it('does not accept unassigned courier dispatch',async()=>{
  const {store,tx}=rig();
  await expect(store.dispatch(user,'delivery-1',{claveOperacion:'D2:DISPATCH:001'}))
   .rejects.toThrow('Asigne repartidor');
  expect(tx.entrega.update).not.toHaveBeenCalled();
 });
 it('limits courier list to the actor own deliveries',async()=>{
  const {store,tx}=rig();
  tx.usuarioRol.findFirst.mockImplementation(async({where}:any)=>{
   const code=where.OR?.[0]?.rol?.rolPermisosComoRol?.some?.permiso?.codigo;
   return code==='delivery.courier'?{id:'courier-role'}:null;
  });
  (tx.entrega as any).findMany=vi.fn().mockResolvedValue([]);
  (tx.entrega as any).count=vi.fn().mockResolvedValue(0);
  await store.list(user,{sucursalId:'branch-1',page:1,limit:20});
  expect((tx.entrega as any).findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({repartidorId:'admin'})
  }));
 });
});
