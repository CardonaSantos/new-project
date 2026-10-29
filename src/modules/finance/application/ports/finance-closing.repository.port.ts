import type {Principal} from '../../../auth/application/auth.service.js';
import type {ClosePreviewQuery,CloseConfirmInput} from '../contracts/finance-closing.types.js';
export abstract class FinanceClosingRepositoryPort{
 abstract preview(user:Principal,query:ClosePreviewQuery):Promise<unknown>;
 abstract confirm(user:Principal,input:CloseConfirmInput):Promise<unknown>;
 abstract detail(user:Principal,sucursalId:string,fechaOperativa:string):Promise<unknown>;
}
