import { describe, expect, it, vi } from 'vitest';
import { PrismaOrganizationRepository } from './prisma-organization.repository.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service.js';

function setup() {
  const db = {
    sucursal: { findMany: vi.fn().mockResolvedValue([]) },
    dispositivo: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;
  return { db, repo: new PrismaOrganizationRepository(db) };
}

describe('PrismaOrganizationRepository permission scope in read queries', () => {
  it('mantiene la restricción aunque se incluya un cursor de otra sucursal', async () => {
    const { db, repo } = setup();
    await repo.branchOptions(
      { cursor: 'id-extrano', limit: 20 },
      { global: false, branchIds: ['b1'] },
    );
    const query = vi.mocked(db.sucursal.findMany).mock.calls[0][0]!;
    expect(query.where).toEqual(
      expect.objectContaining({
        AND: [{ id: { in: ['b1'] } }, { id: { gt: 'id-extrano' } }],
        activa: true,
      }),
    );
  });
  it('combina sucursal solicitada y sucursal autorizada con AND en los listados', async () => {
    const { db, repo } = setup();
    await repo.listDevices(
      { page: 1, limit: 20, sucursalId: 'b2' },
      { global: false, branchIds: ['b1'] },
    );
    const query = vi.mocked(db.dispositivo.findMany).mock.calls[0][0]!;
    expect(query.where).toEqual(
      expect.objectContaining({
        AND: [{ sucursalId: { in: ['b1'] } }, { sucursalId: 'b2' }],
      }),
    );
  });
  it('no permite saltar el filtro con cursor ni con sucursal ajena en selects', async () => {
    const { db, repo } = setup();
    await repo.deviceOptions(
      { sucursalId: 'b2', cursor: 'cursor-extrano', limit: 10 },
      { global: false, branchIds: ['b1'] },
    );
    const query = vi.mocked(db.dispositivo.findMany).mock.calls[0][0]!;
    expect(query.where).toEqual(
      expect.objectContaining({
        AND: [
          { sucursalId: { in: ['b1'] } },
          { sucursalId: 'b2' },
          { id: { gt: 'cursor-extrano' } },
        ],
      }),
    );
  });
});
