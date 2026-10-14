import type {MediaRecord} from '../domain/media.types.js';

export function toMediaResponse(row:MediaRecord) {
 return {
  id:row.id,sucursalId:row.sucursalId,contexto:row.contexto,
  tipo:row.tipo,mimeType:row.mimeType,nombreOriginal:row.nombreOriginal,
  tamanoBytes:row.tamanoBytes?.toString()??null,hashSha256:row.hashContenido,
  publico:row.publico,
  urlPublica:row.confirmadaEn&&!row.eliminadaEn?row.urlPublica:null,
  confirmadaEn:row.confirmadaEn?.toISOString()??null,
  creadoEn:row.creadoEn.toISOString()
 };
}
