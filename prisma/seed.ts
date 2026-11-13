import 'dotenv/config';
import {randomBytes} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../src/generated/prisma/client.js';
import {argon2id,hash} from 'argon2';
import {baseUnits,operationalRoles,unitConversions} from './seed-roles.js';
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
 ['finance.statements.read','finance'],['finance.statements.import','finance'],
 ['finance.statements.match','finance'],['finance.statements.override','finance'],['finance.reversals.create','finance'],
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
 ['payments.refund','payments'],['delivery.manage','delivery'],['delivery.read','delivery'],['delivery.courier','delivery'],
 ['delivery.payments.collect','delivery'],['delivery.settlements.read','delivery'],
 ['delivery.settlements.manage','delivery'],['delivery.platform.manage','delivery'],['reservations.read','reservations'],['reservations.manage','reservations'],
 ['customers.read','customers'],['customers.create','customers'],['customers.manage','customers'],
 ['customers.global.manage','customers'],
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
  // Self-service (QR/tablet) ordering: a least-privilege system account used to
  // attribute Ordenes created by customers directly (Orden.usuarioId is NOT NULL).
  // It never logs in — its password hash is a random, discarded value.
  const selfServiceEmail='autoservicio@sistema.interno';
  const selfServicePerms=['orders.create','orders.manage','catalog.read'] as const;
  const selfServiceRol=await tx.rol.upsert({where:{codigo:'AUTOSERVICIO_SISTEMA'},
   update:{alcance:'GLOBAL',activo:true},
   create:{codigo:'AUTOSERVICIO_SISTEMA',nombre:'Autoservicio (sistema)',alcance:'GLOBAL'}});
  for(const code of selfServicePerms){
   const permiso=await tx.permiso.findUnique({where:{codigo:code}});
   if(!permiso)throw Error(`Permiso ${code} no existe; revise la lista de permisos del seed`);
   await tx.rolPermiso.upsert({where:{rolId_permisoId:{rolId:selfServiceRol.id,permisoId:permiso.id}},
    update:{},create:{rolId:selfServiceRol.id,permisoId:permiso.id}});
  }
  let selfServiceUser=await tx.usuario.findUnique({where:{email:selfServiceEmail}});
  if(!selfServiceUser){
   selfServiceUser=await tx.usuario.create({data:{
    email:selfServiceEmail,nombre:'Autoservicio',
    hashContrasena:await hash(randomBytes(32).toString('hex'),{
     type:argon2id,memoryCost:19456,timeCost:2,parallelism:1
    }),debeCambiarContrasena:false,activo:true,perfil:{create:{}}
   }});
  }
  const selfServiceHasRol=await tx.usuarioRol.findFirst({where:{
   usuarioId:selfServiceUser.id,rolId:selfServiceRol.id,sucursalId:null
  }});
  if(!selfServiceHasRol)await tx.usuarioRol.create({
   data:{usuarioId:selfServiceUser.id,rolId:selfServiceRol.id,sucursalId:null}});

  // Ready-made roles so the first admin can create staff without assembling
  // permission sets by hand. Permissions are only added, never removed: an
  // admin who tailors a role keeps their changes across re-runs.
  for(const role of operationalRoles){
   // update:{} on purpose — an admin who renamed, re-described or disabled one
   // of these keeps that; re-running the seed must not undo their work.
   const rolOperativo=await tx.rol.upsert({where:{codigo:role.codigo},update:{},
    create:{codigo:role.codigo,nombre:role.nombre,descripcion:role.descripcion,
     alcance:'SUCURSAL'}});
   for(const code of role.permissions){
    const permiso=await tx.permiso.findUnique({where:{codigo:code}});
    if(!permiso)throw Error(`Permiso ${code} del rol ${role.codigo} no existe en la lista del seed`);
    await tx.rolPermiso.upsert({
     where:{rolId_permisoId:{rolId:rolOperativo.id,permisoId:permiso.id}},
     update:{},create:{rolId:rolOperativo.id,permisoId:permiso.id}});
   }
  }

  // Reference units. Articles, recipe components and purchase presentations
  // all require one, so without these the catalog can't be populated at all.
  const units=new Map<string,string>();
  for(const unit of baseUnits){
   const row=await tx.unidadMedida.upsert({where:{codigo:unit.codigo},
    update:{nombre:unit.nombre,dimension:unit.dimension,esBase:unit.esBase},
    create:{codigo:unit.codigo,nombre:unit.nombre,dimension:unit.dimension,
     esBase:unit.esBase}});
   units.set(unit.codigo,row.id);
  }
  for(const [from,to,factor] of unitConversions){
   const origen=units.get(from)!,destino=units.get(to)!;
   await tx.conversionUnidad.upsert({
    where:{unidadOrigenId_unidadDestinoId:{unidadOrigenId:origen,unidadDestinoId:destino}},
    update:{factor},create:{unidadOrigenId:origen,unidadDestinoId:destino,factor}});
  }

  // Per-branch operating bones. One warehouse with a single location that is
  // both where purchases land and where the kitchen consumes from: separating
  // reception from consumption would force a transfer before anything can be
  // used, which is friction on a fresh install. Extra locations can be added
  // later from the app.
  const almacen=await tx.almacen.upsert({
   where:{sucursalId_codigo:{sucursalId:principal.id,codigo:'PRINCIPAL'}},
   update:{},create:{sucursalId:principal.id,codigo:'PRINCIPAL',nombre:'Almacén principal'}});
  const ubicacion=await tx.ubicacionAlmacen.upsert({
   where:{almacenId_codigo:{almacenId:almacen.id,codigo:'GENERAL'}},
   update:{},create:{almacenId:almacen.id,codigo:'GENERAL',nombre:'General',esRecepcion:true}});

  // A station with a consumption location is what makes "send to kitchen"
  // work: with none configured, that call fails with "Falta configurar la ruta
  // de cocina o ubicación de consumo". One active station needs no routes —
  // every product falls back to it until the business adds more.
  const station=await tx.estacionPreparacion.findUnique({
   where:{sucursalId_nombre:{sucursalId:principal.id,nombre:'Cocina'}}});
  if(!station){
   await tx.estacionPreparacion.create({
    data:{sucursalId:principal.id,nombre:'Cocina',ubicacionConsumoId:ubicacion.id}});
  }else if(!station.ubicacionConsumoId){
   // Only fills the gap that would break sending to kitchen; a location the
   // admin already chose is left alone.
   await tx.estacionPreparacion.update({where:{id:station.id},
    data:{ubicacionConsumoId:ubicacion.id}});
  }

  // Collecting cash needs an open shift, and a shift needs a register.
  await tx.caja.upsert({
   where:{sucursalId_codigo:{sucursalId:principal.id,codigo:'CAJA-1'}},
   update:{},create:{sucursalId:principal.id,codigo:'CAJA-1',nombre:'Caja principal'}});

  // The room that tables hang off. Tables themselves are the business's own
  // floor plan, so they're left to the admin rather than guessed here.
  await tx.sala.upsert({
   where:{sucursalId_nombre:{sucursalId:principal.id,nombre:'Sala principal'}},
   update:{},create:{sucursalId:principal.id,nombre:'Sala principal'}});
 });
 process.stdout.write(
  'Seed inicial completado; credenciales no impresas.\n'+
  'Listo para operar: empresa, sucursal PRINCIPAL, SUPER_ADMIN, roles operativos\n'+
  '(ADMIN_SUCURSAL, CAJERO, MESERO, COCINA, ALMACEN), unidades de medida,\n'+
  'almacén con ubicación, estación de cocina, caja y sala principal.\n'+
  'Falta por configurar desde la app: mesas, catálogo y cuentas financieras.\n');
}finally{await db.$disconnect();}
