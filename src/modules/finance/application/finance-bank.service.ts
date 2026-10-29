import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {FinanceBankRepositoryPort} from './ports/finance-bank.repository.port.js';
import type {BankQuery,BankImportInput,BankMatchInput,BankUnmatchInput,BankReverseInput} from './contracts/finance-bank.types.js';
@Injectable()
export class FinanceBankService{
 constructor(private readonly repository:FinanceBankRepositoryPort){}
 list(u:Principal,q:BankQuery){return this.repository.list(u,q);}
 unmatched(u:Principal,q:BankQuery){return this.repository.unmatched(u,q);}
 importLines(u:Principal,d:BankImportInput){return this.repository.importLines(u,d);}
 match(u:Principal,d:BankMatchInput){return this.repository.match(u,d);}
 unmatch(u:Principal,d:BankUnmatchInput){return this.repository.unmatch(u,d);}
 reverse(u:Principal,d:BankReverseInput){return this.repository.reverse(u,d);}
}
