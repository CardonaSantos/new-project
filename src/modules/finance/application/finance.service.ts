import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {FinanceRepositoryPort} from './ports/finance.repository.port.js';
import type {FinanceAccountQueryDto,FinanceOperationIntentDto,FinanceAccountCreateDto,
 FinanceMovementQueryDto,FinanceExpenseQueryDto,FinanceExpenseCreateDto,
 FinanceExternalPendingQueryDto,FinanceExternalPostDto,FinanceRouteUpsertDto}
 from './contracts/finance.types.js';
@Injectable()
export class FinanceService{
 constructor(private readonly repository:FinanceRepositoryPort){}
 accounts(u:Principal,q:FinanceAccountQueryDto){return this.repository.accounts(u,q)}
 account(u:Principal,id:string){return this.repository.account(u,id)}
 movements(u:Principal,id:string,q:FinanceMovementQueryDto){return this.repository.movements(u,id,q)}
 issueIntent(u:Principal,d:FinanceOperationIntentDto){return this.repository.issueIntent(u,d)}
 createAccount(u:Principal,d:FinanceAccountCreateDto){return this.repository.createAccount(u,d)}
 createExpense(u:Principal,d:FinanceExpenseCreateDto){return this.repository.createExpense(u,d)}
 expenses(u:Principal,q:FinanceExpenseQueryDto){return this.repository.expenses(u,q)}
 expense(u:Principal,id:string){return this.repository.expense(u,id)}
 financialRoutes(u:Principal,sucursalId:string){return this.repository.financialRoutes(u,sucursalId)}
 upsertFinancialRoute(u:Principal,d:FinanceRouteUpsertDto){return this.repository.upsertFinancialRoute(u,d)}
 pendingExternal(u:Principal,q:FinanceExternalPendingQueryDto){return this.repository.pendingExternal(u,q)}
 postExternal(u:Principal,d:FinanceExternalPostDto){return this.repository.postExternal(u,d)}
}
