export class CustomerPolicyError extends Error {}
export const coordinate=(raw:string|null|undefined,axis:'latitud'|'longitud')=>{
 if(raw===undefined||raw===null)return raw;
 if(!/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,7})?$/.test(raw))
  throw new CustomerPolicyError('Coordenada inválida');
 const [integer,fraction='']=raw.replace('-','').split('.');
 const value=BigInt(integer)*10000000n+BigInt(fraction.padEnd(7,'0'));
 if(value>(axis==='latitud'?90n:180n)*10000000n)
  throw new CustomerPolicyError('Coordenada fuera de rango');
 return raw;
};
export function normalizeCustomerName(name:string){
 const normalized=name.trim().replace(/\s+/g,' ');
 if(normalized.length<2||normalized.length>180)
  throw new CustomerPolicyError('Nombre inválido');
 return normalized;
}
export function cleanOptional(raw:string|null|undefined){
 if(raw===undefined||raw===null)return raw;
 return raw.trim()||null;
}
