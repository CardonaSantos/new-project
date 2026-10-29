import {FinancePolicyError} from './finance-policy.error.js';
export interface BankMatchEvidence{
 bankReference:string|null;
 originReferences:readonly (string|null|undefined)[];
 bankDay:string;originDay:string;
}
const normalize=(s:string)=>s.trim().toUpperCase().replace(/\s+/g,' ');
export function compareBankMatchEvidence(e:BankMatchEvidence):string[]{
 const issues:string[]=[];
 const reference=e.bankReference?.trim();
 const values=e.originReferences.filter((v):v is string=>!!v?.trim()).map(normalize);
 if(!reference||!values.length||!values.includes(normalize(reference)))
  issues.push('Referencia bancaria no coincide con la fuente verificada');
 const bank=new Date(e.bankDay+'T00:00:00.000Z');
 const source=new Date(e.originDay+'T00:00:00.000Z');
 if(!Number.isFinite(bank.getTime())||!Number.isFinite(source.getTime()))
  throw new FinancePolicyError('VALIDATION','Fecha de extracto u origen inválida');
 const offset=Math.round((bank.getTime()-source.getTime())/86400000);
 if(offset<0||offset>14)
  issues.push('Fecha bancaria fuera de ventana de compensación (0 a 14 días)');
 return issues;
}
export function localBankDay(date:Date,zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(key:string)=>parts.find(x=>x.type===key)?.value??'';
 return [part('year'),part('month'),part('day')].join('-');
}
