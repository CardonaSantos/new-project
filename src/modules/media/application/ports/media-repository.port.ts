import type {MediaPage, MediaRecord, NewMedia, MediaTipo} from '../../domain/media.types.js';

export abstract class MediaRepositoryPort {
  abstract create(input: NewMedia): Promise<MediaRecord>;
  abstract getById(id: string): Promise<MediaRecord | null>;
  abstract list(input: {
    sucursalId: string | null;
    tipo?: MediaTipo;
    contexto?: string;
    page: number;
    limit: number;
  }): Promise<MediaPage>;
  abstract confirm(id: string, input: {
    size: bigint;
    mime: string;
    hash: string | null;
    etag: string | null;
    publicUrl: string | null;
  }): Promise<MediaRecord>;
  abstract hasReferences(id: string): Promise<boolean>;
  abstract markDeleted(id: string): Promise<void>;
  abstract removePending(id: string): Promise<void>;
  abstract listStalePending(before: Date, limit: number): Promise<MediaRecord[]>;
  abstract claimStalePending(id: string, before: Date): Promise<boolean>;
  abstract releasePendingClaim(id: string): Promise<void>;
}
