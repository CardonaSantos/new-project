import PDFDocument from 'pdfkit';

// Narrow 80mm-thermal-styled receipt, mirroring the HTML print views in
// orders-order-print-page.ts / orders-kitchen-print-page.ts (frontend) so the shared
// WhatsApp button has a real PDF file to hand to navigator.share() instead of relying
// on the browser's print dialog, which never produces an actual file.
const W=227,M=12,INNER=W-2*M;
const ink='#141414',muted='#5a5a5a',ruleColor='#bbbbbb';

export interface ReceiptField{label:string;value:string;strong?:boolean}
export interface ReceiptLine{qty:string;nombre:string;modificadores:string[];nota:string|null}
export interface ReceiptContent{
 brand:string;kind:string;numero:string;meta?:string;
 fields:ReceiptField[];
 note:{title:string;text:string}|null;
 lines:ReceiptLine[];
 // Direct-sale items riding along on the same order (no prep, nothing to track beyond
 // "grab this too") — kept out of `lines` so they read as a distinct, shorter checklist
 // rather than more prep work.
 extraLines?:{qty:string;nombre:string}[];
 emptyText:string;
 footer:string;
}

/** Renders content once to measure its total height (pdfkit's heightOfString needs no
 * active page — only the current font/size), then once more onto a page sized to fit
 * exactly, so the PDF has no blank trailing space like a real receipt-roll printout. */
export async function renderReceipt(content:ReceiptContent):Promise<Buffer>{
 const doc=new PDFDocument({margin:0,autoFirstPage:false});
 let y=0;
 const draw=(active:boolean):void=>{
  y=16;
  const text=(s:string,opts:{size?:number;bold?:boolean;color?:string;
   align?:'left'|'center'|'right';gap?:number}={}):void=>{
   // 'Courier'/'Courier-Bold' are pdfkit's built-in standard-14 fonts (no embedding needed)
   // and match the monospace 'Courier New' the on-screen thermal-receipt view uses
   // (.gc-thermal-paper in styles.scss), so the PDF looks like the same ticket.
   doc.font(opts.bold?'Courier-Bold':'Courier').fontSize(opts.size??9);
   const textOpts:{width:number;align:'left'|'center'|'right'}={width:INNER,align:opts.align??'left'};
   const h=doc.heightOfString(s,textOpts);
   // fillColor() writes a color-space operator to the content stream immediately (unlike
   // font()/fontSize(), which are just state), so it needs an active page — only call it
   // once we're actually drawing, never during the measure-only pass.
   if(active)doc.fillColor(opts.color??ink).text(s,M,y,textOpts);
   y+=h+(opts.gap??2);
  };
  const divider=():void=>{
   if(active)doc.moveTo(M,y).lineTo(W-M,y).lineWidth(0.5).strokeColor(ruleColor).stroke();
   y+=8;
  };
  // Brand is omitted on internal tickets (kitchen staff already know which restaurant
  // they're standing in) to keep those receipts short and save paper.
  if(content.brand)text(content.brand,{bold:true,size:11,align:'center',gap:1});
  text(content.kind,{bold:true,size:9,align:'center',gap:1});
  text(content.numero,{bold:true,size:9,align:'center',gap:content.meta?1:6});
  // The date/time lives here, small, instead of its own field row below — same info,
  // less vertical space on the slip.
  if(content.meta)text(content.meta,{size:7,color:muted,align:'center',gap:6});
  divider();
  for(const f of content.fields)text(f.label+': '+f.value,{bold:!!f.strong,size:8,gap:3});
  divider();
  if(content.note){
   text(content.note.title,{bold:true,size:8,gap:2});
   text(content.note.text,{size:8,gap:4});
   divider();
  }
  if(content.lines.length){
   for(const l of content.lines){
    text(l.qty+' x '+l.nombre,{bold:true,size:9,gap:1});
    for(const mod of l.modificadores)text('+ '+mod,{size:7.5,color:muted,gap:1});
    if(l.nota)text('Nota: '+l.nota,{size:7.5,color:muted,gap:1});
    y+=3;
   }
  }else{
   text(content.emptyText,{size:8,gap:2});
  }
  if(content.extraLines?.length){
   divider();
   text('TAMBIÉN INCLUIR',{bold:true,size:7.5,gap:3});
   for(const e of content.extraLines)text(e.qty+' x '+e.nombre,{size:8,gap:2});
  }
  // Internal tickets pass an empty footer (nothing worth stating to staff is worth the
  // paper), so skip both the closing divider and the text rather than print a blank line.
  if(content.footer){
   divider();
   text(content.footer,{size:7,color:muted,align:'center'});
  }
  y+=10;
 };
 draw(false);
 const chunks:Buffer[]=[];
 doc.on('data',(c:Buffer)=>chunks.push(c));
 const done=new Promise<Buffer>((resolve,reject)=>{
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.on('error',reject);
 });
 doc.addPage({size:[W,Math.ceil(y)],margin:0});
 draw(true);
 doc.end();
 return done;
}

const MODE_LABELS:Record<string,string>={MOSTRADOR:'En mostrador',MESA:'Para una mesa',
 PARA_LLEVAR:'Para llevar',DELIVERY:'A domicilio'};
export const modeLabel=(v:string):string=>MODE_LABELS[v]??v;

/** DD/MM/YYYY HH:mm in the branch's IANA zone — mirrors formatInstant() on the frontend
 * (shared/formatting/date-time.ts) so the PDF shows the same local time the staff UI does. */
export function receiptInstant(date:Date,zone:string):string{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
 const v=(t:string):string=>p.find(x=>x.type===t)?.value??'';
 const hour=v('hour')==='24'?'00':v('hour');
 return v('day')+'/'+v('month')+'/'+v('year')+' '+hour+':'+v('minute');
}

/** Mirrors kitchenModifierNames() on the frontend (thermal-print.helpers.ts). */
export function receiptModifiers(mods:readonly{nombreSnapshot:string;cantidad:number}[]):string[]{
 return mods.map(x=>x.cantidad===1?x.nombreSnapshot:x.cantidad+' × '+x.nombreSnapshot);
}

/** Quantities are Prisma.Decimal; trims to a plain, receipt-friendly number
 * ("1" not "1.000", "1.5" not "1.500") without pulling in a full i18n formatter. */
export function qtyText(d:{toNumber?():number;toString():string}):string{
 const n=typeof d.toNumber==='function'?d.toNumber():Number(d.toString());
 if(Number.isInteger(n))return String(n);
 return n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
}
