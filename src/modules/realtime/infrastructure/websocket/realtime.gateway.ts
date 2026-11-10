import {Injectable,Logger} from '@nestjs/common';
import {
 ConnectedSocket,MessageBody,OnGatewayConnection,OnGatewayDisconnect,
 SubscribeMessage,WebSocketGateway,WebSocketServer,
} from '@nestjs/websockets';
import type {Server,Socket} from 'socket.io';
import {AuthService,type Principal} from '../../../auth/application/auth.service.js';
import {RealtimePort} from '../../application/ports/realtime.port.js';

/**
 * Push layer over the existing EventoOutbox (see order-shared.ts). Clients still fetch state from
 * the REST endpoints they already use (Cocina keeps its polling as a fallback) — a socket event
 * only tells an already-authenticated client "something in your sucursal changed, refetch now"
 * instead of waiting for the next poll. No business payload is sent over the socket.
 *
 * CORS is intentionally permissive here (unlike the HTTP server's CORS_ORIGINS allowlist): the
 * handshake below requires a valid access token on every connection, so the real access boundary
 * is authentication, not origin. Tighten this later with an explicit allowlist if needed.
 *
 * Single-process only: Socket.IO's default in-memory adapter only reaches clients connected to
 * THIS Node process. If the backend ever runs as more than one instance, add Socket.IO's Redis
 * adapter (@socket.io/redis-adapter) at bootstrap so `emit` fans out across instances — nothing
 * here on the application side needs to change, since callers only know about RealtimePort.
 */
@WebSocketGateway({cors:{origin:true,credentials:true},namespace:'/realtime'})
@Injectable()
export class RealtimeGateway implements RealtimePort,OnGatewayConnection,OnGatewayDisconnect{
 private readonly log=new Logger(RealtimeGateway.name);
 @WebSocketServer() private server!:Server;
 constructor(private readonly auth:AuthService){}

 /** Authenticates once per connection; AuthenticationGuard reads the result back from
  * client.data.auth for every @SubscribeMessage instead of re-parsing a bearer header. */
 async handleConnection(client:Socket&{data:{auth?:Principal}}):Promise<void>{
  const token=String(client.handshake.auth?.['token']??'');
  if(!token){this.log.log('Conexión '+client.id+' rechazada: sin token');client.disconnect(true);return}
  try{
   client.data.auth=await this.auth.authenticate(token);
   this.log.log('Conexión '+client.id+' autenticada (usuario '+client.data.auth.id+')');
  }catch(e){
   this.log.log('Conexión '+client.id+' rechazada: token inválido ('+(e as Error).message+')');
   client.disconnect(true);
  }
 }

 handleDisconnect(client:Socket):void{this.log.log('Conexión '+client.id+' cerrada')}

 /** A client only ever needs events for its current active sucursal. */
 @SubscribeMessage('join:sucursal')
 joinSucursal(@ConnectedSocket() client:Socket,@MessageBody() sucursalId:unknown):void{
  if(typeof sucursalId!=='string'||!sucursalId)return;
  for(const room of client.rooms)if(room.startsWith('sucursal:'))client.leave(room);
  client.join('sucursal:'+sucursalId);
  this.log.log('Conexión '+client.id+' se unió a sucursal:'+sucursalId);
 }

 /** Fire-and-forget: a missing/disconnected server must never fail the caller's transaction.
  * The diagnostic room-size read below is wrapped on its own so a failure there can never
  * block the real emit (it previously did: server.sockets.adapter is undefined on a namespaced
  * server — the adapter lives directly at server.adapter — so the typo threw before the emit
  * below ever ran, silently dropping every event). */
 emit(sucursalId:string,event:string,payload:Record<string,unknown>):void{
  const room='sucursal:'+sucursalId;
  try{
   const size=this.server?.adapter.rooms.get(room)?.size??0;
   this.log.log('Emitiendo '+event+' a '+room+' ('+size+' cliente(s) conectado(s))');
  }catch(e){this.log.warn('No se pudo leer el tamaño de '+room+': '+(e as Error).message)}
  try{
   this.server?.to(room).emit(event,payload);
  }catch(e){this.log.warn('No se pudo emitir '+event+': '+(e as Error).message)}
 }
}
