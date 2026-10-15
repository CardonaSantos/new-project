import { describe, it, expect } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  hasSuperAdminAssignment,
  preventLastSuperAdminRemoval,
  preventSelfAdministrativeAction,
  normalizeEmail,
} from './user-policy.js';

describe('User policy', () => {
  it('protege las acciones contra uno mismo', () => {
    expect(() => preventSelfAdministrativeAction('u1', 'u1')).toThrow(
      ForbiddenException,
    );
    expect(() => preventSelfAdministrativeAction('u1', 'u2')).not.toThrow();
  });
  it('impide retirar al último administrador', () => {
    expect(() => preventLastSuperAdminRemoval(true, false, 1)).toThrow(
      ConflictException,
    );
    expect(() => preventLastSuperAdminRemoval(true, false, 2)).not.toThrow();
    expect(() => preventLastSuperAdminRemoval(false, false, 1)).not.toThrow();
  });
  it('distingue asignaciones globales de sucursal', () => {
    expect(
      hasSuperAdminAssignment([
        { rolCodigo: 'SUPER_ADMIN', alcance: 'SUCURSAL', sucursalId: 'b1' },
      ]),
    ).toBe(false);
    expect(
      hasSuperAdminAssignment([
        { rolCodigo: 'SUPER_ADMIN', alcance: 'GLOBAL', sucursalId: null },
      ]),
    ).toBe(true);
  });
  it('normaliza correos', () =>
    expect(normalizeEmail(' ADMIN@EXAMPLE.COM ')).toBe('admin@example.com'));
});
