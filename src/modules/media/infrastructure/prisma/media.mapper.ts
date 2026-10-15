import type { Media } from '../../../../generated/prisma/client.js';
import type { MediaRecord } from '../../domain/media.types.js';

export class MediaMapper {
  static toDomain(row: Media): MediaRecord {
    return {
      id: row.id,
      sucursalId: row.sucursalId,
      contexto: row.contexto,
      publico: row.publico,
      proveedor: row.proveedor,
      bucket: row.bucket,
      region: row.region,
      claveObjeto: row.claveObjeto,
      urlPublica: row.urlPublica,
      tipo: row.tipo,
      mimeType: row.mimeType,
      nombreOriginal: row.nombreOriginal,
      tamanoBytes: row.tamanoBytes,
      hashContenido: row.hashContenido,
      etag: row.etag,
      subidaPorId: row.subidaPorId,
      confirmadaEn: row.confirmadaEn,
      eliminadaEn: row.eliminadaEn,
      creadoEn: row.creadoEn,
    };
  }
}
