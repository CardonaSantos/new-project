import { describe, expect, it } from 'vitest';
import { swaggerEnabled } from './swagger.js';

describe('Swagger visibility', () => {
  it('enables local development and test by default', () => {
    expect(swaggerEnabled('development')).toBe(true);
    expect(swaggerEnabled('test')).toBe(true);
  });
  it('defaults to disabled in production', () => {
    expect(swaggerEnabled('production')).toBe(false);
  });
  it('supports explicit enabled/disabled overrides', () => {
    expect(swaggerEnabled('production', 'true')).toBe(true);
    expect(swaggerEnabled('development', 'false')).toBe(false);
  });
});
