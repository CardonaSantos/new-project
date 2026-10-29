import {describe,expect,it} from 'vitest';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const modulesRoot=join(process.cwd(),'src','modules');
const business=['auth','catalog','finance','inventory','media','orders',
 'organization','payments','purchases','recipes','supply','users'];
function controllers(path:string):string[]{
 const root=join(path,'presentation');
 if(!existsSync(root))return [];
 function walk(dir:string):string[]{
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
   const location=join(dir,entry.name);
   return entry.isDirectory()?walk(location):entry.name.endsWith('.controller.ts')?[location]:[];
  });
 }
 return walk(root);
}
describe('Gastro Core architecture boundaries',()=>{
 it('every business module has application and ports, infrastructure and presentation',()=>{
  for(const module of business){
   const folder=join(modulesRoot,module);
   expect(existsSync(join(folder,'application')),module).toBe(true);
   expect(existsSync(join(folder,'application','ports')),module).toBe(true);
   expect(existsSync(join(folder,'infrastructure')),module).toBe(true);
   expect(existsSync(join(folder,'presentation')),module).toBe(true);
   // Auth is already hexagonal through its identity policies/ports; never add empty folders.
   if(module!=='auth')expect(existsSync(join(folder,'domain')),module).toBe(true);
  }
 });
 it('HTTP controllers never depend on Prisma adapters or direct database services',()=>{
  for(const module of business){
   for(const path of controllers(join(modulesRoot,module))){
    const source=readFileSync(path,'utf8');
    expect(source.includes('infrastructure/prisma'),path).toBe(false);
    expect(source.includes('PrismaService'),path).toBe(false);
   }
  }
 });
});
