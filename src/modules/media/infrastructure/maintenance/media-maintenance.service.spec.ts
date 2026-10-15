import { describe, it, expect, vi } from 'vitest';
import { MediaMaintenanceService } from './media-maintenance.service.js';
import type { MediaRepositoryPort } from '../../application/ports/media-repository.port.js';
import type { FileStoragePort } from '../../application/ports/file-storage.port.js';

describe('MediaMaintenanceService', () => {
  it('limpia archivos abandonados que pudo reclamar', async () => {
    const repo = {
      listStalePending: vi
        .fn()
        .mockResolvedValue([{ id: 'orphan', bucket: 'b', claveObjeto: 'key' }]),
      claimStalePending: vi.fn().mockResolvedValue(true),
      removePending: vi.fn(),
    } as unknown as MediaRepositoryPort;
    const storage = { remove: vi.fn() } as unknown as FileStoragePort;
    const service = new MediaMaintenanceService(repo, storage);
    expect(await service.purgeStalePending()).toBe(1);
    expect(storage.remove).toHaveBeenCalledWith('b', 'key');
    expect(repo.removePending).toHaveBeenCalledWith('orphan');
  });
  it('no borra un objeto que otro proceso reclamó', async () => {
    const repo = {
      listStalePending: vi
        .fn()
        .mockResolvedValue([{ id: 'orphan', bucket: 'b', claveObjeto: 'key' }]),
      claimStalePending: vi.fn().mockResolvedValue(false),
    } as unknown as MediaRepositoryPort;
    const storage = { remove: vi.fn() } as unknown as FileStoragePort;
    expect(
      await new MediaMaintenanceService(repo, storage).purgeStalePending(),
    ).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
