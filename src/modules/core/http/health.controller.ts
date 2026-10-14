import {Controller,Get} from '@nestjs/common';
import {Public} from '../../auth/presentation/http/decorators/auth.decorators.js';
@Controller('health')
export class HealthController {
 @Public()
 @Get()
 getHealth(){return {status:'ok',service:'gastro-core'};}
}
