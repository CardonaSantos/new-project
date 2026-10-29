import {FinancePolicyError} from './finance-policy.error.js';
export const bankAmount=/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
export function assertStatementAmount(amount:string){
 if(!bankAmount.test(amount)||Number(amount)===0)throw new FinancePolicyError('VALIDATION','Monto firmado inválido de extracto');
}
export function assertBankDate(value:string){
 const d=new Date(value+'T00:00:00.000Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||
  d.toISOString().slice(0,10)!==value)throw new FinancePolicyError('VALIDATION','Fecha bancaria inválida');
 return d;
}
export function assertReversibleSource(kind:string){
 if(kind!=='GASTO_OPERATIVO')
  throw new FinancePolicyError('CONFLICT','Los pagos y devoluciones deben corregirse en su módulo de origen; solo reversa bancaria de gastos operativos');
}
export function bankExternalKey(raw:string){
 const value=raw.trim();
 if(value.length<3||value.length>160)
  throw new FinancePolicyError('VALIDATION','Identificador de extracto inválido');
 return value;
}
export function financeReason(raw:string){
 const value=raw.trim();
 if(value.length<10||value.length>500)
  throw new FinancePolicyError('VALIDATION','Motivo financiero debe tener 10 a 500 caracteres reales');
 return value;
}
