import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  contexts,
  type SupportedMime,
} from '../../../application/media-file-rules.js';
import type { MediaContexto, MediaTipo } from '../../../domain/media.types.js';

const types = ['IMAGEN', 'VIDEO', 'DOCUMENTO'];
function parseBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class MediaUploadDto {
  @IsOptional() @IsIn(contexts) contexto: MediaContexto = 'GENERAL';
  @IsOptional() @IsString() @MaxLength(40) sucursalId?: string;
  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  publico = false;
}

export class MediaPresignDto extends MediaUploadDto {
  @IsString() @IsIn(['video/mp4', 'video/webm']) mime!: SupportedMime;
  @IsString() @MaxLength(180) nombre!: string;
  @IsInt() @Min(1) @Max(1024 * 1024 * 1024) sizeBytes!: number;
}

export class MediaListDto {
  @IsOptional() @IsString() @MaxLength(40) sucursalId?: string;
  @IsOptional() @IsIn(types) tipo?: MediaTipo;
  @IsOptional() @IsIn(contexts) contexto?: MediaContexto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
