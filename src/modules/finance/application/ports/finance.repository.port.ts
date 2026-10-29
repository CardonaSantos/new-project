import type {Principal} from '../../../auth/application/auth.service.js';
import type {FinanceAccountQueryDto,FinanceOperationIntentDto,FinanceAccountCreateDto,
 FinanceMovementQueryDto,FinanceExpenseQueryDto,FinanceExpenseCreateDto,
 FinanceExternalPendingQueryDto,FinanceExternalPostDto,FinanceRouteUpsertDto}
 from '../contracts/finance.types.js';
export abstract class FinanceRepositoryPort {
 abstract accounts(u:Principal,q:FinanceAccountQueryDto):Promise<any>;
 abstract account(u:Principal,id:string):Promise<any>;
 abstract movements(u:Principal,id:string,q:FinanceMovementQueryDto):Promise<any>;
 abstract issueIntent(u:Principal,d:FinanceOperationIntentDto):Promise<any>;
 abstract createAccount(u:Principal,d:FinanceAccountCreateDto):Promise<any>;
 abstract createExpense(u:Principal,d:FinanceExpenseCreateDto):Promise<any>;
 abstract expenses(u:Principal,q:FinanceExpenseQueryDto):Promise<any>;
 abstract expense(u:Principal,id:string):Promise<any>;
 abstract financialRoutes(u:Principal,sucursalId:string):Promise<any>;
 abstract upsertFinancialRoute(u:Principal,d:FinanceRouteUpsertDto):Promise<any>;
 abstract pendingExternal(u:Principal,q:FinanceExternalPendingQueryDto):Promise<any>;
 abstract postExternal(u:Principal,d:FinanceExternalPostDto):Promise<any>;
}
