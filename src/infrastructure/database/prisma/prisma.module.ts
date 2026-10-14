import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Import in infrastructure modules only; not global.
// Nest reuses this module instance across imports.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
