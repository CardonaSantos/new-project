/**
 * Carga de un cliente real desde su JSON revisado.
 *
 *   npx prisma migrate reset
 *   npm run seed:initial
 *   npm run seed:cliente -- --revisar            (valida, no escribe nada)
 *   npm run seed:cliente
 *
 * Opciones:
 *   --archivo=ruta.json   por defecto prisma/cliente/datos/rio-azul.json
 *   --foto=ruta.png       foto genérica, por defecto prisma/cliente/datos/foto-generica.png
 *   --fases=maestros,fotos,existencias,qr   (por defecto todas)
 *
 * Requiere en el .env (o en la consola):
 *   CLIENTE_CARGA_PERMITIR=si
 *   CLIENTE_CONTRASENA_INICIAL=...   (mínimo 10 caracteres; la usan todos los
 *                                     usuarios del cliente la primera vez, y el
 *                                     sistema les pide cambiarla al entrar)
 *
 * Fases:
 *   maestros     configuración y catálogo, en una transacción. Solo corre sobre
 *                una base sin catálogo.
 *   fotos        una foto genérica por producto (una copia por producto, para
 *                que cambiar la de uno no afecte a los demás). El POS y el menú
 *                QR solo muestran productos con foto.
 *   existencias  saldo inicial por insumo (y lote, si vence), con el servicio
 *                de inventario. Repetirla no duplica: cada saldo tiene clave.
 *   qr           códigos QR de las mesas, solo si el cliente acepta pedidos QR.
 *
 * Si una fase posterior a «maestros» falla, se corrige la causa y se vuelve a
 * correr solo esa fase: `npm run seed:cliente -- --fases=fotos,existencias`.
 */
import 'reflect-metadata';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { argon2id, hash } from 'argon2';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service.js';
import { MediaService } from '../../src/modules/media/application/media.service.js';
import { CatalogService } from '../../src/modules/catalog/application/catalog.service.js';
import { InventoryOperationsService } from '../../src/modules/inventory/application/inventory-operations.service.js';
import { SelfServiceService } from '../../src/modules/self-service/application/self-service.service.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import type { Principal } from '../../src/modules/auth/application/auth.service.js';
import { validar, type DatosCliente } from './tipos.js';
import { decimal, escribirMaestros } from './maestros.js';

const FASES = ['maestros', 'fotos', 'existencias', 'qr'] as const;
type Fase = (typeof FASES)[number];

interface Opciones {
  archivo: string;
  foto: string;
  fases: Fase[];
  revisar: boolean;
}

function opciones(argv: string[]): Opciones {
  const o: Opciones = {
    archivo: 'prisma/cliente/datos/rio-azul.json',
    foto: 'prisma/cliente/datos/foto-generica.png',
    fases: [...FASES],
    revisar: false,
  };
  for (const arg of argv) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k === 'archivo' && v) o.archivo = v;
    else if (k === 'foto' && v) o.foto = v;
    else if (k === 'revisar') o.revisar = true;
    else if (k === 'fases' && v) {
      const pedidas = v.split(',').map((x) => x.trim());
      for (const f of pedidas) if (!FASES.includes(f as Fase)) throw Error(`Fase desconocida: ${f}. Use ${FASES.join(', ')}.`);
      o.fases = pedidas as Fase[];
    } else if (k !== 'ignorar-tipos') throw Error(`Opción desconocida: ${arg}`);
  }
  return o;
}

const t0 = Date.now();
const avance = (msg: string) =>
  process.stdout.write(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s] ${msg}\n`);

function permitido(env: NodeJS.ProcessEnv, revisar: boolean): void {
  if (revisar) return;
  if (env.CLIENTE_CARGA_PERMITIR !== 'si')
    throw Error('La carga está bloqueada. Agregue CLIENTE_CARGA_PERMITIR=si al .env de la máquina donde va a cargar.');
  if (env.NODE_ENV === 'production' && env.CLIENTE_CARGA_PRODUCCION !== 'si')
    throw Error(
      'NODE_ENV=production. La carga se hace en la base local y luego se copia con pg_dump. ' +
        'Si de verdad quiere cargar aquí, agregue CLIENTE_CARGA_PRODUCCION=si.',
    );
  if (!env.CLIENTE_CONTRASENA_INICIAL || env.CLIENTE_CONTRASENA_INICIAL.length < 10)
    throw Error('Falta CLIENTE_CONTRASENA_INICIAL (mínimo 10 caracteres): es la contraseña con que entran los usuarios la primera vez.');
}

async function main(): Promise<void> {
  const o = opciones(process.argv.slice(2));
  permitido(process.env, o.revisar);

  const datos = JSON.parse(readFileSync(o.archivo, 'utf8')) as DatosCliente;
  const problemas = validar(datos);
  if (problemas.length) {
    process.stderr.write(`El archivo ${o.archivo} tiene ${problemas.length} problemas:\n`);
    for (const p of problemas) process.stderr.write('  - ' + p + '\n');
    process.exit(1);
  }
  const foto = readFileSync(o.foto);
  avance(`${o.archivo}: datos verificados (${Object.entries(datos.resumen).map(([k, v]) => `${v} ${k}`).join(', ')})`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(PrismaService);
  try {
    // Lo que la semilla inicial debe haber dejado.
    const admin = await db.usuario.findFirst({
      where: { usuarioRolesComoUsuario: { some: { rol: { codigo: 'SUPER_ADMIN' } } }, activo: true },
      orderBy: { creadoEn: 'asc' },
    });
    if (!admin) throw Error('No hay un usuario SUPER_ADMIN: ejecute primero "npm run seed:initial".');
    const actor: Principal = {
      id: admin.id, email: admin.email, nombre: admin.nombre, sessionId: 'carga-cliente',
      debeCambiarContrasena: false, versionAutorizacion: admin.versionAutorizacion,
    };
    const sucursal = await db.sucursal.findUnique({ where: { codigo: 'PRINCIPAL' } });
    if (!sucursal) throw Error('No existe la sucursal PRINCIPAL: ejecute primero "npm run seed:initial".');
    const productos = await db.producto.count();

    if (o.fases.includes('maestros') && productos > 0)
      throw Error(
        `La base ya tiene ${productos} productos. La carga del cliente corre sobre una base recién preparada:\n` +
          '  npx prisma migrate reset\n  npm run seed:initial\n  npm run seed:cliente\n' +
          'Para repetir solo una fase posterior: npm run seed:cliente -- --fases=fotos,existencias',
      );
    if (!o.fases.includes('maestros') && productos === 0)
      throw Error('La base no tiene catálogo: corra primero la fase «maestros».');

    if (o.revisar) {
      const correos = await db.usuario.findMany({
        where: { email: { in: datos.usuarios.map((u) => u.email) } },
        select: { email: true },
      });
      if (correos.length) throw Error('Ya existen usuarios con estos correos: ' + correos.map((c: { email: string }) => c.email).join(', '));
      avance('revisión completa: la base está lista y el archivo es válido. No se escribió nada.');
      return;
    }

    if (o.fases.includes('maestros')) {
      const contrasena = await hash(process.env.CLIENTE_CONTRASENA_INICIAL!, {
        type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
      });
      avance('maestros: escribiendo en una sola transacción…');
      await db.$transaction((tx: Prisma.TransactionClient) => escribirMaestros(tx, datos, contrasena, avance), {
        maxWait: 60_000,
        timeout: 20 * 60_000,
      });
      avance('maestros: confirmados');
    }

    const ubicacion = await db.ubicacionAlmacen.findFirst({
      where: { codigo: 'GENERAL', almacen: { codigo: 'PRINCIPAL', sucursalId: sucursal.id } },
    });
    if (!ubicacion) throw Error('Falta la ubicación GENERAL del almacén PRINCIPAL.');

    if (o.fases.includes('fotos')) {
      const media = app.get(MediaService);
      const catalogo = app.get(CatalogService);
      let subidas = 0;
      for (const p of datos.productos) {
        const row = await db.producto.findUnique({
          where: { codigo: p.codigo },
          select: { id: true, medios: { select: { mediaId: true }, take: 1 } },
        });
        if (!row || row.medios.length) continue;
        try {
          const subida = await media.upload(actor, {
            file: foto,
            declaredMime: 'image/png',
            name: `${p.codigo.toLowerCase()}.png`,
            contexto: 'PRODUCTO',
            sucursalId: null,
            publico: true,
          });
          await catalogo.replaceMedia(actor, 'product', row.id, [subida.id]);
          subidas++;
        } catch (error) {
          throw Error(
            `No se pudo subir la foto de ${p.nombre}: ${(error as Error).message}. ` +
              'Revise DO_SPACES_* en el .env (sin fotos el POS no muestra la carta) y repita: ' +
              'npm run seed:cliente -- --fases=fotos,existencias',
            { cause: error },
          );
        }
      }
      avance(`fotos: ${subidas} productos con la foto genérica`);
    }

    if (o.fases.includes('existencias')) {
      const inventario = app.get(InventoryOperationsService);
      let cargadas = 0;
      for (const e of datos.existencias) {
        const art = await db.articuloInventario.findUnique({ where: { codigo: e.articulo }, select: { id: true } });
        if (!art) throw Error(`El insumo ${e.articulo} no está en la base.`);
        let loteId: string | undefined;
        if (e.lote) {
          const existente = await db.loteInventario.findFirst({
            where: { articuloId: art.id, codigoLote: e.lote.toUpperCase() },
            select: { id: true },
          });
          loteId =
            existente?.id ??
            ((await inventario.createLot(actor, {
              articuloId: art.id,
              codigoLote: e.lote,
              ...(e.vence ? { fechaVencimiento: e.vence } : {}),
            })) as { id: string }).id;
        }
        await inventario.manual(actor, 'OPENING', {
          articuloId: art.id,
          ubicacionId: ubicacion.id,
          ...(loteId ? { loteId } : {}),
          cantidad: decimal(e.cantidad),
          costoUnitario: decimal(e.costoUnitario),
          claveOperacion: `CARGA-INICIAL:${e.articulo}:${e.lote ?? '-'}`.slice(0, 120),
          motivo: 'Existencia inicial del cliente',
        });
        cargadas++;
      }
      avance(`existencias: ${cargadas} saldos iniciales en ${sucursal.codigo} / General`);
    }

    if (o.fases.includes('qr')) {
      if (!datos.sucursal.pedidosQR) avance('qr: el cliente no acepta pedidos por QR; no se emiten códigos');
      else {
        const qr = app.get(SelfServiceService);
        const mesas = await db.mesa.findMany({
          where: { activa: true, sala: { sucursalId: sucursal.id, activa: true } },
          select: { id: true },
        });
        for (const m of mesas) await qr.issueTableQr(actor, m.id);
        avance(`qr: ${mesas.length} mesas con código`);
      }
    }

    process.stdout.write('\nCarga terminada.\n');
    const provisionales = datos.usuarios.filter((u) => u.correoProvisional);
    process.stdout.write(
      `\nUsuarios (${datos.usuarios.length}) — entran con CLIENTE_CONTRASENA_INICIAL y el sistema les pide cambiarla:\n` +
        datos.usuarios.map((u) => `  - ${u.nombre} <${u.email}>${u.correoProvisional ? '  (correo provisional)' : ''}: ${u.roles.join(', ')}`).join('\n') +
        '\n',
    );
    if (provisionales.length)
      process.stdout.write('  Los correos provisionales se cambian en Usuarios cuando la persona tenga uno propio.\n');
    if (datos.reporte.pendientes.length)
      process.stdout.write('\nPendientes del cliente:\n' + datos.reporte.pendientes.map((p) => '  - ' + p).join('\n') + '\n');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\nLa carga se detuvo: ${(error as Error).message}\n`);
  process.exit(1);
});
