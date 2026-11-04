import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {InventoryOperationsPort} from './ports/inventory-operations.port.js';
import {InventoryMediaService} from './inventory-media.service.js';
@Injectable()
export class InventoryOperationsService {
 constructor(private readonly port:InventoryOperationsPort,private readonly media:InventoryMediaService){}
 private async images(rows:any[],id:(row:any)=>string|undefined,nested:boolean){
  const urls=await this.media.primaryUrls(rows.map(id).filter((value):value is string=>!!value))
   .catch(()=>new Map<string,string|null>()); // Optional media must not block stock or Kardex.
  return rows.map(row=>nested?{...row,articulo:{...row.articulo,
   imagenPrincipalUrl:urls.get(id(row)??'')??null}}:
   {...row,imagenPrincipalUrl:urls.get(id(row)??'')??null});
 }
 async stock(actor:Principal,...args:any[]){
  const result=await this.port.stock(actor,...args);
  return {...result,data:await this.images(result.data,(row)=>row.articulo?.id,true)};
 }
 async summary(actor:Principal,...args:any[]){
  const result=await this.port.summary(actor,...args);
  return {...result,data:await this.images(result.data,(row)=>row.articuloId,false)};
 }
 lots(actor:Principal,...args:any[]){return this.port.lots(actor,...args);}
 createLot(actor:Principal,...args:any[]){return this.port.createLot(actor,...args);}
 blockLot(actor:Principal,...args:any[]){return this.port.blockLot(actor,...args);}
 manual(actor:Principal,...args:any[]){return this.port.manual(actor,...args);}
 inboundBatch(actor:Principal,...args:any[]){return this.port.inboundBatch(actor,...args);}
 async movements(actor:Principal,...args:any[]){
  const result=await this.port.movements(actor,...args);
  return {...result,data:await this.images(result.data,(row)=>row.articuloId,true)};
 }
 async movement(actor:Principal,...args:any[]){
  const result=await this.port.movement(actor,...args);
  const [withImage]=await this.images([result],(row)=>row.articulo?.id,true);
  return withImage;
 }
 valuation(actor:Principal,...args:any[]){return this.port.valuation(actor,...args);}
 expiry(actor:Principal,...args:any[]){return this.port.expiry(actor,...args);}
 reconciliation(actor:Principal,...args:any[]){return this.port.reconciliation(actor,...args);}
 createCount(actor:Principal,...args:any[]){return this.port.createCount(actor,...args);}
 count(actor:Principal,...args:any[]){return this.port.count(actor,...args);}
 counts(actor:Principal,...args:any[]){return this.port.counts(actor,...args);}
 cancelCount(actor:Principal,...args:any[]){return this.port.cancelCount(actor,...args);}
 confirmCount(actor:Principal,...args:any[]){return this.port.confirmCount(actor,...args);}
 createTransfer(actor:Principal,...args:any[]){return this.port.createTransfer(actor,...args);}
 transfer(actor:Principal,...args:any[]){return this.port.transfer(actor,...args);}
 transfers(actor:Principal,...args:any[]){return this.port.transfers(actor,...args);}
 cancelTransfer(actor:Principal,...args:any[]){return this.port.cancelTransfer(actor,...args);}
 dispatch(actor:Principal,...args:any[]){return this.port.dispatch(actor,...args);}
 receive(actor:Principal,...args:any[]){return this.port.receive(actor,...args);}
}
