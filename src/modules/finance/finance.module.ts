import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {FinanceAccountsController} from './finance.controller.js';
import {FinanceStore} from './finance.store.js';

@Module({
 imports:[PrismaModule],
 controllers:[FinanceAccountsController],
 providers:[FinanceStore],
})
export class FinanceModule{}
