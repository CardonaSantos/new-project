import { describe, it, expect, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MediaService } from './media.service.js';
import type { MediaRepositoryPort } from './ports/media-repository.port.js';
import type { FileStoragePort } from './ports/file-storage.port.js';
import type { MediaSettingsPort } from './ports/media-settings.port.js';
import type { IdentityRepository } from '../../auth/application/ports/identity.repository.js';
import type { Principal } from '../../auth/application/auth.service.js';

const user: Principal = {
  id: 'admin',
  email: 'admin@example.com',
  nombre: 'Admin',
  sessionId: 's',
  debeCambiarContrasena: false,
  versionAutorizacion: 1,
};
const media = {
  id: 'media-1',
  sucursalId: 'b1',
  contexto: 'PERFIL',
  publico: false,
  proveedor: 'DIGITALOCEAN_SPACES',
  bucket: 'bucket',
  region: 'sfo3',
  claveObjeto: 'gastro-core/media/perfil/imagen/k.png',
  urlPublica: null,
  tipo: 'IMAGEN' as const,
  mimeType: 'image/png',
  nombreOriginal: 'avatar.png',
  tamanoBytes: 100n,
  hashContenido: 'hash',
  etag: null,
  subidaPorId: user.id,
  confirmadaEn: new Date(),
  eliminadaEn: null,
  creadoEn: new Date(),
};
function factory(permission: string[]) {
  const repo = {
    getById: vi.fn().mockResolvedValue(media),
    hasReferences: vi.fn().mockResolvedValue(false),
    markDeleted: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
  } as unknown as MediaRepositoryPort;
  const storage = {
    remove: vi.fn(),
    downloadUrl: vi.fn().mockResolvedValue('https://signed-url'),
  } as unknown as FileStoragePort;
  const settings = {
    region: 'sfo3',
    bucket: 'bucket',
    prefix: 'gastro-core',
    maxDirectBytes: 20 * 1024 * 1024,
    maxVideoBytes: 200 * 1024 * 1024,
  } as MediaSettingsPort;
  const identity = {
    capabilities: vi.fn().mockResolvedValue(permission),
  } as unknown as IdentityRepository;
  return {
    repo,
    storage,
    identity,
    service: new MediaService(repo, storage, settings, identity),
  };
}
describe('MediaService', () => {
  it('no permite leer media de otra sucursal sin autorización', async () => {
    const { service, identity } = factory([]);
    await expect(service.detail(user, 'media-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(identity.capabilities).toHaveBeenCalledWith('admin', 'b1');
  });
  it('genera URL firmada para archivo privado', async () => {
    const { service } = factory(['media.read']);
    expect(await service.access(user, 'media-1')).toEqual({
      url: 'https://signed-url',
      publico: false,
      expiresIn: 300,
    });
  });
  it('no elimina imágenes vinculadas a perfiles o productos', async () => {
    const { service, repo, storage } = factory(['media.delete']);
    vi.mocked(repo.hasReferences).mockResolvedValue(true);
    await expect(service.remove(user, 'media-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('elimina el objeto por bucket+key, no por URL', async () => {
    const { service, storage, repo } = factory(['media.delete']);
    expect(await service.remove(user, 'media-1')).toEqual({
      id: 'media-1',
      eliminado: true,
    });
    expect(storage.remove).toHaveBeenCalledWith('bucket', media.claveObjeto);
    expect(repo.markDeleted).toHaveBeenCalledWith('media-1');
  });
});
