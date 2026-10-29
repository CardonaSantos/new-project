export type ExpenseFunding={origen:'CAJA'|'CUENTA_FINANCIERA';
 turnoId?:string;cuentaFinancieraId?:string;documentoReferencia?:string};
export function expenseFundingIssue(d:ExpenseFunding):string|null{
 if(d.origen==='CAJA'&&(!d.turnoId||d.cuentaFinancieraId))
  return 'Gasto de caja requiere únicamente turnoId';
 if(d.origen==='CUENTA_FINANCIERA'&&(!d.cuentaFinancieraId||d.turnoId))
  return 'Gasto bancario requiere únicamente cuentaFinancieraId';
 if(d.origen==='CUENTA_FINANCIERA'&&!d.documentoReferencia?.trim())
  return 'Referencia de pago externo obligatoria';
 return null;
}
