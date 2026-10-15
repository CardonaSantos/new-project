import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaSettingsPort } from '../../application/ports/media-settings.port.js';

@Injectable()
export class SpacesSettings extends MediaSettingsPort {
  readonly region: string;
  readonly endpoint: string;
  readonly key: string;
  readonly secret: string;
  readonly bucket: string;
  readonly cdnBase: string;
  readonly prefix: string;
  readonly maxDirectBytes: number;
  readonly maxVideoBytes: number;

  constructor(config: ConfigService) {
    super();
    const required = (name: string) => {
      const value = config.get<string>(name)?.trim();
      if (!value) throw new Error(`Falta variable de entorno ${name}`);
      return value;
    };
    this.region = required('DO_SPACES_REGION');
    this.endpoint = required('DO_SPACES_ENDPOINT');
    this.key = required('DO_SPACES_KEY');
    this.secret = required('DO_SPACES_SECRET');
    this.bucket = required('DO_SPACES_BUCKET');
    this.cdnBase = (config.get<string>('DO_SPACES_CDN_BASE') ?? '')
      .trim()
      .replace(/\/+$/, '');
    const raw = (
      config.get<string>('MEDIA_BASE_PREFIX') ?? 'gastro-core'
    ).trim();
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(raw))
      throw new Error('MEDIA_BASE_PREFIX inválido');
    this.prefix = raw;
    if (
      !/^https:\/\//.test(this.endpoint) ||
      (this.cdnBase && !/^https:\/\//.test(this.cdnBase))
    )
      throw new Error('Spaces endpoint y CDN deben usar HTTPS');
    const mb = (name: string, def: number) => {
      const value = Number(config.get<string>(name) ?? def);
      if (!Number.isInteger(value) || value < 1 || value > 1024)
        throw new Error(`${name} inválido`);
      return value * 1024 * 1024;
    };
    this.maxDirectBytes = Math.min(
      mb('MEDIA_DIRECT_MAX_MB', 20),
      20 * 1024 * 1024,
    );
    this.maxVideoBytes = mb('MEDIA_VIDEO_MAX_MB', 200);
  }
}
