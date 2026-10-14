import Decimal from 'decimal.js';
// Las entradas monetarias deben llegar como texto decimal, nunca float JS.
export function money(value:string):string{
 if(!/^-?\d{1,16}(\.\d{1,2})?$/.test(value))throw Error('Importe inválido');
 return new Decimal(value).toFixed(2);
}
export function decimalQuantity(value:string):string{
 if(!/^-?\d{1,14}(\.\d{1,6})?$/.test(value))throw Error('Cantidad inválida');
 return new Decimal(value).toFixed(6);
}
