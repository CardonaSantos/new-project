import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MediaRepositoryPort } from '../../application/ports/media-repository.port.js';
import { FileStoragePort } from '../../application/ports/file-storage.port.js';

const INTERVAL_MS = 30 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000;

@Injectable()
export class MediaMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaMaintenanceService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(
    private readonly repo: MediaRepositoryPort,
    private readonly storage: FileStoragePort,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.purgeStalePending();
    }, INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async purgeStalePending(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let cleaned = 0;
    try {
      const before = new Date(Date.now() - STALE_AFTER_MS);
      const pending = await this.repo.listStalePending(before, 50);
      for (const item of pending) {
        const claimed = await this.repo.claimStalePending(item.id, before);
        if (!claimed) continue;
        try {
          await this.storage.remove(item.bucket, item.claveObjeto);
          await this.repo.removePending(item.id);
          cleaned++;
        } catch (error) {
          await this.repo.releasePendingClaim(item.id);
          this.logger.warn(
            `Falló purga de media pendiente ${item.id}: ${error instanceof Error ? error.name : 'UNKNOWN'}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar media pendiente: ${error instanceof Error ? error.name : 'UNKNOWN'}`,
      );
    } finally {
      this.running = false;
    }
    return cleaned;
  }
}
