import type {Principal} from '../../../auth/application/auth.service.js';
/** Port for RecipeStore, isolating recipe application from Prisma internals. */
export abstract class RecipeStorePort {
 abstract list(actor:Principal,...args:any[]):Promise<any>;
 abstract options(actor:Principal,...args:any[]):Promise<any>;
 abstract detail(actor:Principal,...args:any[]):Promise<any>;
 abstract create(actor:Principal,...args:any[]):Promise<any>;
 abstract update(actor:Principal,...args:any[]):Promise<any>;
 abstract newVersion(actor:Principal,...args:any[]):Promise<any>;
 abstract revise(actor:Principal,...args:any[]):Promise<any>;
 abstract publish(actor:Principal,...args:any[]):Promise<any>;
 abstract coverage(actor:Principal,...args:any[]):Promise<any>;
 abstract modifier(actor:Principal,...args:any[]):Promise<any>;
 abstract setModifier(actor:Principal,...args:any[]):Promise<any>;
 abstract packaging(actor:Principal,...args:any[]):Promise<any>;
 abstract createPackaging(actor:Principal,...args:any[]):Promise<any>;
 abstract packagingOne(actor:Principal,...args:any[]):Promise<any>;
 abstract replacePackaging(actor:Principal,...args:any[]):Promise<any>;
 abstract packagingStatus(actor:Principal,...args:any[]):Promise<any>;
}
