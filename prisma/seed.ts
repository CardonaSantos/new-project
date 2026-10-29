import 'dotenv/config';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../src/generated/prisma/client.js';
import {argon2id,hash} from 'argon2';
const url=process.env.DIRECT_URL??process.env.DATABASE_URL;
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!url)throw Error('DATABASE_URL (o DIRECT_URL) requerido para seed');
const email=(process.env.BOOTSTRAP_ADMIN_EMAIL??'admin@novasistemas.net').trim().toLowerCase();
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const permissions=[
 ['users.create','users'],['users.roles.assign','users'],['users.read','users'],['users.deactivate','users'],
 ['users.update','users'],['users.status.manage','users'],['users.password.reset','users'],
 ['users.sessions.read','users'],['users.sessions.revoke','users'],['users.audit.read','users'],
 ['users.reports.read','users'],
 ['roles.read','roles'],['roles.manage','roles'],
 ['organization.read','organization'],['organization.manage','organization'],
 ['branches.read','organization'],['branches.manage','organization'],
 ['devices.read','organization'],['devices.manage','organization'],
 ['media.read','media'],['media.upload','media'],['media.delete','media'],['media.publish','media'],
 ['catalog.read','catalog'],['catalog.manage','catalog'],
 ['catalog.prices.manage','catalog'],['catalog.menus.manage','catalog'],
 ['catalog.reports.read','catalog'],['orders.read','orders'],['orders.create','orders'],
 ['orders.manage','orders'],['orders.cancel.prepared','orders'],['orders.discount','orders'],['kitchen.read','kitchen'],['kitchen.manage','kitchen'],
 ['tables.read','tables'],['tables.manage','tables'],['inventory.read','inventory'],
 ['inventory.adjust','inventory'],['inventory.transfer','inventory'],
 ['inventory.units.manage','inventory'],['inventory.articles.manage','inventory'],
 ['inventory.warehouses.manage','inventory'],['inventory.reports.read','inventory'],
 ['inventory.costs.read','inventory'],['inventory.costs.manage','inventory'],
 ['recipes.read','recipes'],['recipes.manage','recipes'],['recipes.publish','recipes'],
 ['recipes.produce','recipes'],['recipes.production.read','recipes'],
 ['supply.request','supply'],['supply.read','supply'],['supply.send','supply'],['supply.receive','supply'],['supply.cancel','supply'],
 ['finance.read','finance'],['finance.accounts.manage','finance'],['finance.movements.read','finance'],
 ['finance.expenses.read','finance'],['finance.expenses.create','finance'],
 ['finance.reconciliation.read','finance'],['finance.movements.post','finance'],
 ['finance.routing.read','finance'],['finance.routing.manage','finance'],
 ['finance.closing.read','finance'],['finance.closing.execute','finance'],
 ['purchases.manage','purchases'],['purchases.read','purchases'],
 ['purchases.suppliers.manage','purchases'],['purchases.presentations.manage','purchases'],
 ['purchases.orders.create','purchases'],['purchases.orders.approve','purchases'],
 ['purchases.receipts.create','purchases'],['purchases.receipts.confirm','purchases'],
 ['purchases.invoices.manage','purchases'],['purchases.invoices.confirm','purchases'],
 ['purchases.payments.create','purchases'],['purchases.payments.confirm','purchases'],
 ['purchases.returns.manage','purchases'],['purchases.credits.manage','purchases'],
 ['inventory.consume.internal','inventory'],
 ['cash.read','cash'],['cash.manage','cash'],['cash.open','cash'],['cash.close','cash'],
 ['payments.read','payments'],['payments.collect','payments'],['payments.verify','payments'],
 ['payments.split','payments'],['sales.read','payments'],
 ['payments.refund','payments'],['delivery.manage','delivery'],['reservations.manage','reservations'],
 ['reports.read','reports'],['settings.manage','settings']
] as const;
try{
 await db.$transaction(async(tx)=>{
  const enterprise=await tx.empresaConfiguracion.findFirst();
  if(!enterprise)await tx.empresaConfiguracion.create({data:{
   nombreComercial:process.env.BOOTSTRAP_COMPANY_NAME??'Gastro Core',
   moneda:'GTQ',zonaHoraria:'America/Guatemala'
  }});
  const principal=await tx.sucursal.upsert({where:{codigo:'PRINCIPAL'},update:{},create:{
   codigo:'PRINCIPAL',nombre:'Sucursal principal'
  }});
  await tx.configuracionSucursal.upsert({where:{sucursalId:principal.id},update:{},
   create:{sucursalId:principal.id,moneda:'GTQ'}});
  const rol=await tx.rol.upsert({where:{codigo:'SUPER_ADMIN'},update:{alcance:'GLOBAL',activo:true},create:{
   codigo:'SUPER_ADMIN',nombre:'Superadministrador',alcance:'GLOBAL'
  }});
  for(const [code,modulo] of permissions){
   const permiso=await tx.permiso.upsert({where:{codigo:code},update:{modulo},create:{codigo:code,modulo}});
   await tx.rolPermiso.upsert({where:{rolId_permisoId:{rolId:rol.id,permisoId:permiso.id}},
    update:{},create:{rolId:rol.id,permisoId:permiso.id}});
  }
  let admin=await tx.usuario.findUnique({where:{email}});
  if(admin){
   const alreadyAdmin=await tx.usuarioRol.findFirst({where:{
    usuarioId:admin.id,rolId:rol.id,sucursalId:null
   }});
   if(!alreadyAdmin)throw Error('El correo de bootstrap ya pertenece a una cuenta sin SUPER_ADMIN global; seed detenido');
  }else{
   if(!password||password.length<12)throw Error('BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 12 caracteres para el primer usuario');
   admin=await tx.usuario.create({data:{
    email,nombre:'Administrador',hashContrasena:await hash(password,{
     type:argon2id,memoryCost:19456,timeCost:2,parallelism:1
    }),debeCambiarContrasena:true,perfil:{create:{}}
   }});
   await tx.usuarioRol.create({data:{usuarioId:admin.id,rolId:rol.id,sucursalId:null}});
  }
 });
 process.stdout.write('Seed inicial completado; credenciales no impresas.\n');
}finally{await db.$disconnect();}
