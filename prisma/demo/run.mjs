// Compila la semilla con `tsc` y la ejecuta.
//
// No es un paso ceremonial. La semilla instancia los servicios reales a
// través del contenedor de Nest, y Nest resuelve cada constructor leyendo
// `design:paramtypes`, la metadata que deja `emitDecoratorMetadata`. Solo
// `tsc` la emite: esbuild no la implementa, así que bajo `tsx` todas las
// dependencias llegan `undefined` y el arranque muere en el primer provider
// que use la suya dentro del constructor.
//
// Un script en lugar de `tsc -p … && node …` por dos razones: encadenar con
// `&&` aborta cuando `tsc` reporta errores de tipo, aunque haya emitido el
// JavaScript perfectamente utilizable; y los operadores de shell no se
// escriben igual en cmd que en bash.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const entry = join(root, 'dist-seed', 'prisma', 'demo', 'index.js');

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

if (compiled !== 0) {
  console.warn(
    '\nAdvertencia: hay errores de tipo arriba. El JavaScript se emitió y la\n' +
      'semilla continúa, pero esos errores merecen arreglarse.\n',
  );
}

process.exit(await run(entry, process.argv.slice(2)));
