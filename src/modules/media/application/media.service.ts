import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityRepository } from '../../auth/application/ports/identity.repository.js';
import type { Principal } from '../../auth/application/auth.service.js';
import { MediaRepositoryPort } from './ports/media-repository.port.js';
import { FileStoragePort } from './ports/file-storage.port.js';
import { MediaSettingsPort } from './ports/media-settings.port.js';
import {
  detectMime,
  enforceSize,
  formats,
  generateStorageKey,
  normalizeOriginalName,
  supportedMime,
  type SupportedMime,
} from './media-file-rules.js';
import type {
  MediaContexto,
  MediaRecord,
  MediaTipo,
} from '../domain/media.types.js';
import { toMediaResponse } from './media.presenter.js';

export interface UploadRequest {
  file: Buffer;
  declaredMime: string;
  name: string;
  contexto: MediaContexto;
  sucursalId: string | null;
  publico: boolean;
}
export interface PresignRequest {
  mime: string;
  name: string;
  size: number;
  contexto: MediaContexto;
  sucursalId: string | null;
  publico: boolean;
}
@Injectable()
export class MediaService {
  constructor(
    private readonly repo: MediaRepositoryPort,
    private readonly storage: FileStoragePort,
    private readonly settings: MediaSettingsPort,
    private readonly identities: IdentityRepository,
  ) {}

  private async authorize(
    user: Principal,
    action: string,
    branch: string | null,
  ): Promise<void> {
    const capabilities = await this.identities.capabilities(user.id, branch);
    if (!capabilities.includes(action))
      throw new ForbiddenException('Permiso insuficiente para media');
  }
  private async authorizePublic(
    user: Principal,
    branch: string | null,
    publico: boolean,
    tipo: MediaTipo,
  ) {
    if (!publico) return;
    if (tipo === 'DOCUMENTO')
      throw new BadRequestException('No se permiten documentos PDF públicos');
    await this.authorize(user, 'media.publish', branch);
  }
  private resolveUrl(media: MediaRecord) {
    return toMediaResponse(media);
  }
  private async load(
    user: Principal,
    id: string,
    permission: string,
  ): Promise<MediaRecord> {
    const found = await this.repo.getById(id);
    if (!found || found.eliminadaEn)
      throw new NotFoundException('Media no encontrada');
    await this.authorize(user, permission, found.sucursalId);
    return found;
  }
  async upload(user: Principal, req: UploadRequest) {
    await this.authorize(user, 'media.upload', req.sucursalId);
    if (!req.file?.length) throw new BadRequestException('Archivo requerido');
    const detected = await detectMime(req.file);
    if (
      req.declaredMime &&
      req.declaredMime.toLowerCase() !== 'application/octet-stream' &&
      req.declaredMime.toLowerCase() !== detected
    )
      throw new BadRequestException(
        'Tipo MIME declarado no coincide con los bytes del archivo',
      );
    enforceSize(
      detected,
      req.file.length,
      this.settings.maxDirectBytes,
      this.settings.maxVideoBytes,
    );
    const kind = formats[detected].tipo;
    await this.authorizePublic(user, req.sucursalId, req.publico, kind);
    const key = generateStorageKey(
      this.settings.prefix,
      req.contexto,
      detected,
    );
    const name = normalizeOriginalName(req.name);
    const sha256 = createHash('sha256').update(req.file).digest('hex');
    const stored = await this.storage.upload({
      bucket: this.settings.bucket,
      key,
      bytes: req.file,
      mime: detected,
      publico: req.publico,
    });
    try {
      const item = await this.repo.create({
        sucursalId: req.sucursalId,
        contexto: req.contexto,
        publico: req.publico,
        proveedor: 'DIGITALOCEAN_SPACES',
        bucket: this.settings.bucket,
        region: this.settings.region,
        claveObjeto: key,
        urlPublica: req.publico ? this.storage.publicUrl(key) : null,
        tipo: kind,
        mimeType: detected,
        nombreOriginal: name,
        tamanoBytes: BigInt(req.file.length),
        hashContenido: sha256,
        etag: stored.etag,
        subidaPorId: user.id,
        confirmadaEn: new Date(),
      });
      return this.resolveUrl(item);
    } catch (error) {
      await this.storage
        .remove(this.settings.bucket, key)
        .catch(() => undefined);
      throw error;
    }
  }
  async presign(user: Principal, req: PresignRequest) {
    await this.authorize(user, 'media.upload', req.sucursalId);
    const mime = supportedMime(req.mime.toLowerCase());
    if (formats[mime].tipo !== 'VIDEO')
      throw new BadRequestException('URL firmada reservada para videos');
    enforceSize(mime, req.size, 0, this.settings.maxVideoBytes);
    await this.authorizePublic(user, req.sucursalId, req.publico, 'VIDEO');
    const key = generateStorageKey(this.settings.prefix, req.contexto, mime);
    const item = await this.repo.create({
      sucursalId: req.sucursalId,
      contexto: req.contexto,
      publico: req.publico,
      proveedor: 'DIGITALOCEAN_SPACES',
      bucket: this.settings.bucket,
      region: this.settings.region,
      claveObjeto: key,
      urlPublica: null,
      tipo: 'VIDEO',
      mimeType: mime,
      nombreOriginal: normalizeOriginalName(req.name),
      tamanoBytes: BigInt(req.size),
      hashContenido: null,
      etag: null,
      subidaPorId: user.id,
      confirmadaEn: null,
    });
    try {
      const url = await this.storage.presignPut({
        bucket: item.bucket,
        key: item.claveObjeto,
        mime,
        size: req.size,
        expiresIn: 120,
      });
      return {
        id: item.id,
        uploadUrl: url,
        headers: { 'Content-Type': mime },
        expiresIn: 120,
        expiresAt: new Date(Date.now() + 120000).toISOString(),
      };
    } catch (error) {
      await this.repo.removePending(item.id);
      throw error;
    }
  }
  async confirm(user: Principal, id: string) {
    const item = await this.load(user, id, 'media.upload');
    if (item.confirmadaEn) return this.resolveUrl(item);
    if (item.subidaPorId !== user.id)
      throw new ForbiddenException(
        'Solo quien inició la carga puede confirmarla',
      );
    if (Date.now() - item.creadoEn.getTime() > 15 * 60 * 1000)
      throw new ConflictException('La carga reservada ha vencido');
    const head = await this.storage.inspect(item.bucket, item.claveObjeto);
    if (!head)
      throw new NotFoundException('No se encontró el archivo en Spaces');
    if (
      item.tamanoBytes === null ||
      BigInt(head.size) !== item.tamanoBytes ||
      head.mime !== item.mimeType
    )
      throw new BadRequestException(
        'El archivo remoto no coincide con la reserva',
      );
    const detected = await detectMime(
      await this.storage.firstBytes(item.bucket, item.claveObjeto),
    );
    if (detected !== item.mimeType)
      throw new BadRequestException(
        'El contenido remoto no coincide con su MIME',
      );
    enforceSize(detected, head.size, 0, this.settings.maxVideoBytes);
    await this.authorizePublic(user, item.sucursalId, item.publico, item.tipo);
    if (item.publico) await this.storage.publish(item.bucket, item.claveObjeto);
    const confirmed = await this.repo.confirm(id, {
      size: BigInt(head.size),
      mime: detected,
      hash: null,
      etag: head.etag,
      publicUrl: item.publico ? this.storage.publicUrl(item.claveObjeto) : null,
    });
    return this.resolveUrl(confirmed);
  }
  async detail(user: Principal, id: string) {
    const item = await this.load(user, id, 'media.read');
    return this.resolveUrl(item);
  }
  async access(user: Principal, id: string) {
    const item = await this.load(user, id, 'media.read');
    if (!item.confirmadaEn)
      throw new ConflictException('Archivo pendiente de confirmación');
    if (item.urlPublica)
      return { url: item.urlPublica, publico: true, expiresIn: null };
    const url = await this.storage.downloadUrl(
      item.bucket,
      item.claveObjeto,
      item.mimeType,
      item.nombreOriginal ?? 'archivo',
      300,
    );
    return { url, publico: false, expiresIn: 300 };
  }
  async list(
    user: Principal,
    input: {
      sucursalId: string | null;
      tipo?: MediaTipo;
      contexto?: string;
      page: number;
      limit: number;
    },
  ) {
    await this.authorize(user, 'media.read', input.sucursalId);
    const result = await this.repo.list(input);
    return {
      data: result.data.map((item) => this.resolveUrl(item)),
      meta: {
        page: input.page,
        limit: input.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / input.limit),
      },
    };
  }
  async remove(user: Principal, id: string) {
    const item = await this.load(user, id, 'media.delete');
    if (await this.repo.hasReferences(id))
      throw new ConflictException(
        'Desvincula el archivo de usuarios, productos o categorías antes de eliminarlo',
      );
    await this.storage.remove(item.bucket, item.claveObjeto);
    await this.repo.markDeleted(id);
    return { id, eliminado: true };
  }
}
