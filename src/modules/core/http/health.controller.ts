import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Liveness only: it intentionally does not require DATABASE_URL.
  // A future readiness endpoint may check PostgreSQL explicitly.
  @Get()
  getHealth(): { status: 'ok'; service: 'gastro-core' } {
    return { status: 'ok', service: 'gastro-core' };
  }
}
