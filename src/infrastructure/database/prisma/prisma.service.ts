import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

/**
 * The ONLY Prisma client provider. Domain/application code must use ports;
 * infrastructure adapters may inject this provider.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required to initialize PrismaService');
    }

    const max = Number(config.get<string>('DB_POOL_MAX') ?? '10');
    const connectionTimeoutMillis = Number(
      config.get<string>('DB_CONNECTION_TIMEOUT_MS') ?? '5000',
    );
    if (!Number.isSafeInteger(max) || max <= 0 ||
      !Number.isSafeInteger(connectionTimeoutMillis) || connectionTimeoutMillis <= 0) {
      throw new Error('Invalid database pool configuration');
    }

    super({
      adapter: new PrismaPg({ connectionString, max, connectionTimeoutMillis }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
