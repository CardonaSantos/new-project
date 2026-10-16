import {BadRequestException} from '@nestjs/common';
export type CancellationClassification='CORTESIA'|'MERMA_OPERATIVA'|'ERROR_OPERATIVO'|'OTRO';
export function requiresCancellationAuthorization(x:{consumed:number;prepared:number;delivered:number}):boolean{
 return x.consumed>0||x.prepared>0||x.delivered>0;
}
export function requireCancellationClassification(kind?:CancellationClassification){
 if(!kind)throw new BadRequestException('Orden preparada o entregada: indique clasificacion y requiere permiso de supervisor');
 return kind;
}
