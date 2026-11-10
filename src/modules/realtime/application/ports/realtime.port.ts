/**
 * Push-notification use-case contract: infrastructure-independent application port.
 * Today's only adapter is Socket.IO in a single Node process (see RealtimeGateway).
 * Swap the adapter — e.g. a Redis-backed fanout — behind this same port if the backend
 * ever runs as more than one instance, since Socket.IO's in-memory room list by itself
 * only reaches clients connected to that same process.
 */
export abstract class RealtimePort {
 abstract emit(sucursalId:string,event:string,payload:Record<string,unknown>):void;
}
