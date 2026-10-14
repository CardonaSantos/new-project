export type MediaTipo = 'IMAGEN' | 'VIDEO' | 'DOCUMENTO';
export type MediaContexto = 'GENERAL' | 'PERFIL' | 'PRODUCTO' | 'INVENTARIO' | 'CATEGORIA' | 'DOCUMENTO';

export interface MediaRecord {
  id: string;
  sucursalId: string | null;
  contexto: string;
  publico: boolean;
  proveedor: string;
  bucket: string;
  region: string | null;
  claveObjeto: string;
  urlPublica: string | null;
  tipo: MediaTipo;
  mimeType: string;
  nombreOriginal: string | null;
  tamanoBytes: bigint | null;
  hashContenido: string | null;
  etag: string | null;
  subidaPorId: string | null;
  confirmadaEn: Date | null;
  eliminadaEn: Date | null;
  creadoEn: Date;
}

export interface NewMedia {
  sucursalId: string | null;
  contexto: MediaContexto;
  publico: boolean;
  proveedor: string;
  bucket: string;
  region: string;
  claveObjeto: string;
  urlPublica: string | null;
  tipo: MediaTipo;
  mimeType: string;
  nombreOriginal: string;
  tamanoBytes: bigint;
  hashContenido: string | null;
  etag: string | null;
  subidaPorId: string;
  confirmadaEn: Date | null;
}

export interface MediaPage {
  data: MediaRecord[];
  total: number;
}
