// Compila la carga del cliente con `tsc` y la ejecuta. Misma razón que
// prisma/demo/run.mjs: la carga usa los servicios reales de Nest (fotos,
// inventario, QR), y Nest necesita la metadata que solo emite `tsc`.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const entry = join(root, 'dist-seed', 'prisma', 'cliente', 'index.js');

const run = (file, args) =>
  new Promise((resolve) => {
    spawn(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' })
      .on('close', (code) => resolve(code ?? 1));
  });

if (!existsSync(tsc)) {
  console.error('Falta TypeScript en node_modules: ejecute "npm install".');
  process.exit(1);
}

const compiled = await run(tsc, ['-p', 'tsconfig.seed.json']);

if (!existsSync(entry)) {
  console.error('\nLa compilación no produjo la semilla; no se ejecutó nada.');
  process.exit(compiled || 1);
}

if (compiled !== 0 && !process.argv.includes('--ignorar-tipos')) {
  // Seguir adelante con errores de tipo fue una mala decisión y costó una
  // corrida entera: tsc había reportado `Cannot find name 'batchChance'` con
  // toda claridad, el aviso se perdió entre cuarenta líneas de progreso, y la
  // semilla murió a los treinta segundos por esa misma causa. Un error de tipo
  // en una semilla es una semilla equivocada; no hay nada que tolerar.
  console.error(
    '\nHay errores de tipo arriba y no se ejecutó nada. Corríjalos, o pase\n' +
      '--ignorar-tipos si sabe que son inocuos.\n',
  );
  process.exit(compiled);
}

process.exit(await run(entry, process.argv.slice(2)));
