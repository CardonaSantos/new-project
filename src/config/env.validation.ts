/**
 * Validate optional environment values at bootstrap.
 * DATABASE_URL is intentionally checked by PrismaService instead:
 * the basic health endpoint can run before a database is configured.
 */
export function validateEnvironment(
  values: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of ['PORT', 'DB_POOL_MAX', 'DB_CONNECTION_TIMEOUT_MS']) {
    const raw = values[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0 ||
      (key === 'PORT' && value > 65535)) {
      throw new Error(`Invalid environment variable: ${key}`);
    }
  }
  if (values.SWAGGER_ENABLED !== undefined &&
      !['true', 'false', ''].includes(String(values.SWAGGER_ENABLED))) {
    throw new Error('Invalid environment variable: SWAGGER_ENABLED (true/false)');
  }
  return values;
}
