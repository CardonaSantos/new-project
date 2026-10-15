import { randomUUID } from 'node:crypto';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import type { MediaContexto, MediaTipo } from '../domain/media.types.js';

export const formats = {
  'image/jpeg': { tipo: 'IMAGEN', extension: 'jpg', maxMB: 10 },
  'image/png': { tipo: 'IMAGEN', extension: 'png', maxMB: 10 },
  'image/webp': { tipo: 'IMAGEN', extension: 'webp', maxMB: 10 },
  'image/gif': { tipo: 'IMAGEN', extension: 'gif', maxMB: 10 },
  'application/pdf': { tipo: 'DOCUMENTO', extension: 'pdf', maxMB: 20 },
  'video/mp4': { tipo: 'VIDEO', extension: 'mp4', maxMB: 200 },
  'video/webm': { tipo: 'VIDEO', extension: 'webm', maxMB: 200 },
} as const satisfies Record<
  string,
  { tipo: MediaTipo; extension: string; maxMB: number }
>;

export type SupportedMime = keyof typeof formats;
export const contexts: MediaContexto[] = [
  'GENERAL',
  'PERFIL',
  'PRODUCTO',
  'INVENTARIO',
  'CATEGORIA',
  'DOCUMENTO',
];

export function supportedMime(value: string): SupportedMime {
  if (!Object.hasOwn(formats, value))
    throw new BadRequestException(
      'Formato no permitido: JPG, PNG, WebP, GIF, PDF, MP4 o WebM',
    );
  return value as SupportedMime;
}

export function normalizeOriginalName(value: string): string {
  const name =
    value
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\x00-\x1f\x7f]/g, '')
      .trim() ?? '';
  return name.slice(0, 180) || 'archivo';
}

export function generateStorageKey(
  prefix: string,
  context: MediaContexto,
  mime: SupportedMime,
): string {
  const date = new Date();
  const parts = [
    ...prefix.split('/').filter(Boolean),
    'media',
    context.toLowerCase(),
    formats[mime].tipo.toLowerCase(),
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    randomUUID() + '.' + formats[mime].extension,
  ];
  return parts.join('/');
}

export async function detectMime(bytes: Buffer): Promise<SupportedMime> {
  const guessed = await fileTypeFromBuffer(bytes);
  const detected =
    guessed?.mime ??
    (bytes.subarray(0, 5).toString('ascii') === '%PDF-'
      ? 'application/pdf'
      : null);
  if (!detected)
    throw new BadRequestException(
      'No se reconoce el contenido real del archivo',
    );
  return supportedMime(detected);
}

export function enforceSize(
  mime: SupportedMime,
  size: number,
  directLimit: number,
  videoLimit: number,
): void {
  const format = formats[mime];
  const cap = Math.min(
    format.maxMB * 1024 * 1024,
    format.tipo === 'VIDEO' ? videoLimit : Number.MAX_SAFE_INTEGER,
  );
  if (!Number.isSafeInteger(size) || size < 1)
    throw new BadRequestException('Tamaño de archivo inválido');
  if (size > cap)
    throw new PayloadTooLargeException('Archivo excede el tamaño permitido');
  if (directLimit > 0 && size > directLimit)
    throw new PayloadTooLargeException(
      'Usar carga firmada para archivos grandes',
    );
}
