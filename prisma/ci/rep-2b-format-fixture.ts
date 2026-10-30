import {mkdirSync,writeFileSync} from 'node:fs';
import {renderCsv,renderXlsx,renderPdf} from '../../src/modules/reports/application/report-export-formats.js';
const dir='/tmp/rep2b-smoke';
mkdirSync(dir,{recursive:true});
const report={
 source:'SALES_COSTS',currency:'GTQ',sucursal:{id:'ci',nombre:'Café principal'},
 periodo:{desde:'2026-10-30',hasta:'2026-10-30',
  zonaHoraria:'America/Guatemala',corte:'04:00'},
 generatedAt:'2026-10-30T23:00:00Z',meta:{total:2},
 totales:{lineas:2,ingresos:'44.00',costoIdentificado:'3.085714',
  margenAntesEmpaque:'40.914286',lineasConCosto:2},
 data:[
 {ventaLineaId:'v1',fecha:'2026-10-30T15:00:00.000Z',numeroOrden:'ORD-1',
  producto:'Capuchino de prueba',variante:'Mediano',cantidad:'1.000',
  ingreso:'22.00',costoDirecto:'1.542857',margenAntesEmpaque:'20.457143',
  detalle:'=bad_formula()'},
 {ventaLineaId:'v2',fecha:'2026-10-30T16:00:00.000Z',numeroOrden:'ORD-2',
  producto:'Capuchino de prueba',variante:'Mediano',cantidad:'1.000',
  ingreso:'22.00',costoDirecto:'1.542857',margenAntesEmpaque:'20.457143',
  detalle:'Café con leche'}
 ]};
writeFileSync(dir+'/report.xlsx',renderXlsx(report));
writeFileSync(dir+'/report.pdf',renderPdf(report));
writeFileSync(dir+'/report.csv',renderCsv(report));
console.info('REP-2B binary fixtures created: '+dir);
