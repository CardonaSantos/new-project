export interface CustomerReportQuery{
 sucursalId:string;
 /** Default false: includes inactive customers too, since this is meant to be a
  * complete roster ("todos los datos que el cliente pudiera tener relacionado"). */
 soloActivos?:boolean;
 /** Max rows returned, ordered by historical spend at this branch (desc). Default 500,
  * capped at 2000 by the DTO — this is an export, not a paginated browse view. */
 limite?:number;
}
