import type {Principal} from '../../../auth/application/auth.service.js';
import type {BankQuery,BankImportInput,BankMatchInput,BankUnmatchInput,BankReverseInput} from '../contracts/finance-bank.types.js';
export abstract class FinanceBankRepositoryPort{
 abstract list(u:Principal,q:BankQuery):Promise<unknown>;
 abstract unmatched(u:Principal,q:BankQuery):Promise<unknown>;
 abstract importLines(u:Principal,d:BankImportInput):Promise<unknown>;
 abstract match(u:Principal,d:BankMatchInput):Promise<unknown>;
 abstract unmatch(u:Principal,d:BankUnmatchInput):Promise<unknown>;
 abstract reverse(u:Principal,d:BankReverseInput):Promise<unknown>;
}
