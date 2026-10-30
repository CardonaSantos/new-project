// Integration smoke against the developer's own PostgreSQL DEV via NestJS HTTP.
// Node 20+; no dependencies. Never run against production.
const base=(process.env.RSV_BASE_URL??'http://localhost:3000').replace(/\/$/,'');
const token=process.env.RSV_TOKEN;
const branch=process.env.RSV_SUCURSAL_ID;
const table=process.env.RSV_MESA_ID;
if(!token||!branch||!table)throw Error('Set RSV_TOKEN, RSV_SUCURSAL_ID and RSV_MESA_ID (DEV only)');
const start=new Date(Date.now()+240*60000),end=new Date(start.getTime()+90*60000);
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const request=async(path,method='GET',body)=>{
 const response=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{data={message:'Non-JSON response'}}
 return {status:response.status,data};
};
const uri='/api/reservations/availability?'+new URLSearchParams({
 sucursalId:branch,inicio:start.toISOString(),fin:end.toISOString(),personas:'2'
}).toString();
const availability=await request(uri);
if(availability.status!==200)throw Error('Availability failed HTTP '+availability.status);
const selected=availability.data.mesas?.find(x=>x.id===table);
if(!selected?.disponible)throw Error('The selected table is not available for this future interval. Nothing changed.');
const nonce=Date.now()+'-'+Math.trunc(Math.random()*100000);
const payload={
 sucursalId:branch,mesaIds:[table],personas:2,
 nombreContacto:'Prueba controlada RSV concurrencia',
 inicio:start.toISOString(),fin:end.toISOString()
};
const [one,two]=await Promise.all([
 request('/api/reservations','POST',{...payload,claveOperacion:'RSV:RACE:'+nonce+':ONE'}),
 request('/api/reservations','POST',{...payload,claveOperacion:'RSV:RACE:'+nonce+':TWO'})
]);
console.log('Two simultaneous reservations:',one.status,two.status);
const winner=[one,two].find(x=>x.status===201)?.data;
try{
 if(!winner?.id)throw Error('Neither request succeeded; inspect HTTP responses');
 if(![one.status,two.status].includes(409)||
    [one,two].filter(x=>x.status===201).length!==1)
  throw Error('Expected exactly one 201 and one 409, not '+one.status+'/'+two.status);
 const after=await request(uri);
 const row=after.data.mesas?.find(x=>x.id===table);
 if(after.status!==200||row?.reservaConflictoId!==winner.id)
  throw Error('Availability does not reflect the single winning reservation');
 console.log('PASS: one winner, one conflict; availability linked to winner');
}finally{
 if(winner?.id){
  const cleanup=await request('/api/reservations/'+encodeURIComponent(winner.id)+'/cancel',
   'POST',{motivo:'Fin de prueba concurrente DEV'});
  console.log('Cleanup reservation:',winner.id,'HTTP',cleanup.status);
  if(cleanup.status!==201)process.exitCode=1;
 }
}
