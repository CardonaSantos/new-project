export interface ClosePreviewQuery{sucursalId:string;fechaOperativa:string}
export interface CloseConfirmInput extends ClosePreviewQuery{
 operationId:string;
}
