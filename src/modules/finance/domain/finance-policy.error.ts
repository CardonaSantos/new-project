export type FinancePolicyCategory='VALIDATION'|'CONFLICT';
export class FinancePolicyError extends Error{
 constructor(public readonly category:FinancePolicyCategory,message:string){
  super(message);this.name='FinancePolicyError';
 }
}
