import {ConflictException,ForbiddenException} from '@nestjs/common';
import type {UserAssignment} from './user.types.js';

export function preventSelfAdministrativeAction(actorId:string,targetId:string):void {
 if(actorId===targetId)throw new ForbiddenException('No puede realizar esta operación administrativa sobre su cuenta');
}

export function preventLastSuperAdminRemoval(
 currentlyAdmin:boolean,remainsAdmin:boolean,activeAdmins:number
):void {
 if(currentlyAdmin&&!remainsAdmin&&activeAdmins<=1)
  throw new ConflictException('No se puede retirar al último SUPER_ADMIN activo');
}

export function hasSuperAdminAssignment(assignments:ReadonlyArray<Pick<UserAssignment,'rolCodigo'|'alcance'|'sucursalId'>>):boolean {
 return assignments.some(x=>x.rolCodigo==='SUPER_ADMIN'&&x.alcance==='GLOBAL'&&x.sucursalId===null);
}

export function normalizeEmail(email:string):string {return email.trim().toLowerCase();}
export function normalizeRoleCode(value:string):string {return value.trim().toUpperCase();}
