import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {FinanceClosingRepositoryPort} from './ports/finance-closing.repository.port.js';
import type {ClosePreviewQuery,CloseConfirmInput} from './contracts/finance-closing.types.js';
@Injectable()
export class FinanceClosingService{
 constructor(private readonly repository:FinanceClosingRepositoryPort){}
 preview(user:Principal,query:ClosePreviewQuery){return this.repository.preview(user,query);}
 confirm(user:Principal,input:CloseConfirmInput){return this.repository.confirm(user,input);}
 detail(user:Principal,sucursalId:string,fechaOperativa:string){
  return this.repository.detail(user,sucursalId,fechaOperativa);
 }
}
