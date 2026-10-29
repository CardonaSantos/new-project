import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {TablePort} from './ports/table.port.js';

@Injectable()
export class TableService {
 constructor(private readonly port:TablePort){}
 rooms(actor:Principal,...args:any[]){return this.port.rooms(actor,...args);}
 createRoom(actor:Principal,...args:any[]){return this.port.createRoom(actor,...args);}
 updateRoom(actor:Principal,...args:any[]){return this.port.updateRoom(actor,...args);}
 list(actor:Principal,...args:any[]){return this.port.list(actor,...args);}
 createTable(actor:Principal,...args:any[]){return this.port.createTable(actor,...args);}
 close(actor:Principal,...args:any[]){return this.port.close(actor,...args);}
 updateTable(actor:Principal,...args:any[]){return this.port.updateTable(actor,...args);}
}
