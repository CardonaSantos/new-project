import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {RealtimeGateway} from './infrastructure/websocket/realtime.gateway.js';
import {RealtimePort} from './application/ports/realtime.port.js';

@Module({
 imports:[AuthModule],
 providers:[RealtimeGateway,{provide:RealtimePort,useExisting:RealtimeGateway}],
 exports:[RealtimePort],
})
export class RealtimeModule{}
