
import {Type} from 'class-transformer';
import {IsArray,ArrayMinSize,ArrayMaxSize,IsBoolean,IsEnum,IsIn,IsInt,IsISO8601,
 IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
const qty=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const amount=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
const rate=/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/;
export class Paging{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @IsString() proveedorId?:string;
 @IsOptional() @IsString() search?:string;
}
export class SupplierDto{
 @IsString() @MinLength(2) @MaxLength(160) nombre!:string;
 @IsOptional() @IsString() @MaxLength(60) nit?:string;
 @IsOptional() @IsString() @MaxLength(80) telefono?:string;
 @IsOptional() @IsString() @MaxLength(160) email?:string;
 @IsOptional() @IsString() @MaxLength(500) direccion?:string;
}
export class SupplierPatchDto{
 @IsOptional() @IsString() @MinLength(2) @MaxLength(160) nombre?:string;
 @IsOptional() @IsString() @MaxLength(60) nit?:string;
 @IsOptional() @IsString() @MaxLength(80) telefono?:string;
 @IsOptional() @IsString() @MaxLength(160) email?:string;
 @IsOptional() @IsString() @MaxLength(500) direccion?:string;
}
export class StatusDto { @IsBoolean() activo!:boolean; }
export class PresentationDto{
 @IsString() articuloId!:string;
 @IsOptional() @IsString() proveedorId?:string;
 @IsString() @MinLength(2) @MaxLength(120) nombre!:string;
 @IsString() unidadCompraId!:string;
 @Matches(qty) factorAUnidadBase!:string;
}
export class KeyDto{@IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;}
export class ReasonKeyDto extends KeyDto{
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
}
export class PurchaseOrderLineDto{
 @IsString() articuloId!:string;
 @IsOptional() @IsString() presentacionId?:string;
 @Matches(qty) cantidadCompra!:string;
 @Matches(qty) factorAUnidadBase!:string;
 @Matches(qty) precioUnitarioCompra!:string;
 @IsOptional() @Matches(rate) tasaImpuesto?:string;
 @IsOptional() @IsBoolean() impuestoRecuperable?:boolean;
}
export class PurchaseOrderDto{
 @IsOptional() @IsString() requisicionId?:string;
 @IsOptional() @IsString() @MinLength(6) @MaxLength(120) claveOperacion?:string;
 @IsString() proveedorId!:string;
 @IsString() sucursalId!:string;
 @IsOptional() @IsBoolean() precioIncluyeImpuesto?:boolean;
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>PurchaseOrderLineDto) lineas!:PurchaseOrderLineDto[];
}
export class ReceiptLineDto{
 @IsOptional() @IsString() ordenCompraLineaId?:string;
 @IsString() articuloId!:string;
 @IsString() ubicacionId!:string;
 @IsOptional() @IsString() loteId?:string;
 @Matches(qty) cantidadCompra!:string;
 @Matches(qty) factorAUnidadBase!:string;
 @Matches(qty) precioUnitarioCompra!:string;
 @IsOptional() @Matches(qty) cantidadRechazada?:string;
 @IsOptional() @Matches(rate) tasaImpuesto?:string;
 @IsOptional() @IsBoolean() impuestoRecuperable?:boolean;
}
export class ReceiptDto{
 @IsOptional() @IsString() ordenCompraId?:string;
 @IsString() proveedorId!:string;
 @IsString() almacenId!:string;
 @IsOptional() @IsBoolean() precioIncluyeImpuesto?:boolean;
 @IsOptional() @IsString() @MaxLength(150) referenciaProveedor?:string;
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>ReceiptLineDto)
 lineas!:ReceiptLineDto[];
}
export class InvoiceLineDto{
 @IsOptional() @IsString() recepcionLineaId?:string;
 @IsOptional() @IsString() articuloId?:string;
 @IsString() @MinLength(2) @MaxLength(250) descripcion!:string;
 @Matches(qty) cantidad!:string;
 @Matches(qty) precioUnitario!:string;
 @IsOptional() @Matches(rate) tasaImpuesto?:string;
}
export class InvoiceDto{
 @IsString() proveedorId!:string;
 @IsString() sucursalId!:string;
 @IsString() @MinLength(1) @MaxLength(100) numeroDocumento!:string;
 @IsOptional() @IsString() @MaxLength(120) referenciaFiscal?:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaEmision!:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaVencimiento?:string;
 @IsBoolean() precioIncluyeImpuesto!:boolean;
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>InvoiceLineDto) lineas!:InvoiceLineDto[];
}
export class PaymentApplicationDto{@IsString() facturaId!:string;@Matches(amount) monto!:string;}
export class SupplierPaymentDto extends KeyDto{
 @IsString() proveedorId!:string;
 @IsString() sucursalId!:string;
 @IsEnum(['EFECTIVO','TARJETA','TRANSFERENCIA','OTRO']) metodo!:'EFECTIVO'|'TARJETA'|'TRANSFERENCIA'|'OTRO';
 @Matches(amount) monto!:string;
 @IsOptional() @IsString() @MaxLength(160) referencia?:string;
 @IsOptional() @IsString() turnoCajaId?:string;
 @IsOptional() @IsString() cuentaFinancieraId?:string;
 @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>PaymentApplicationDto)
 aplicaciones!:PaymentApplicationDto[];
}
export class ApplyDto extends KeyDto{
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>PaymentApplicationDto) aplicaciones!:PaymentApplicationDto[];
}
export class ReturnLineDto{
 @IsString() recepcionLineaId!:string;
 @Matches(qty) cantidadBase!:string;
}
export class ReturnDto{
 @IsString() proveedorId!:string;
 @IsString() almacenId!:string;
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>ReturnLineDto) lineas!:ReturnLineDto[];
}
export class CreditDto{
 @IsString() proveedorId!:string;
 @IsString() sucursalId!:string;
 @IsString() @MinLength(1) numeroDocumento!:string;
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
 @Matches(amount) total!:string;
 // Por defecto el crédito es comercial, no modifica el IVA.
 // El proveedor puede declarar explícitamente el impuesto rectificado.
 @IsOptional() @Matches(amount) impuestos?:string;
 @IsOptional() @IsString() devolucionId?:string;
}
export class CreditApplyDto extends KeyDto{
 @IsString() facturaId!:string;
 @Matches(amount) monto!:string;
}
export class RefundSupplierDto{
 @IsString() notaId!:string;
 @IsEnum(['EFECTIVO','TRANSFERENCIA','TARJETA','OTRO'])
 metodo!:'EFECTIVO'|'TRANSFERENCIA'|'TARJETA'|'OTRO';
 @Matches(amount) monto!:string;
 @IsOptional() @IsString() referencia?:string;
 @IsOptional() @IsString() turnoCajaId?:string;
}
