import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module.js';
import { MediaService } from './application/media.service.js';
import { MediaRepositoryPort } from './application/ports/media-repository.port.js';
import { FileStoragePort } from './application/ports/file-storage.port.js';
import { MediaSettingsPort } from './application/ports/media-settings.port.js';
import { PrismaMediaRepository } from './infrastructure/prisma/prisma-media.repository.js';
import { SpacesSettings } from './infrastructure/storage/spaces.settings.js';
import { SpacesAdapter } from './infrastructure/storage/spaces.adapter.js';
import { MediaMaintenanceService } from './infrastructure/maintenance/media-maintenance.service.js';
import { MediaController } from './presentation/http/media.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MediaController],
  providers: [
    SpacesSettings,
    { provide: MediaSettingsPort, useExisting: SpacesSettings },
    { provide: FileStoragePort, useClass: SpacesAdapter },
    { provide: MediaRepositoryPort, useClass: PrismaMediaRepository },
    MediaService,
    MediaMaintenanceService,
  ],
  exports: [MediaService, MediaRepositoryPort, FileStoragePort],
})
export class MediaModule {}
