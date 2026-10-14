import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// prisma generate/validate work before DATABASE_URL exists.
// Commands that actually connect (migrate/db pull) require a valid URL.
// DIRECT_URL is optional when runtime uses a transaction pooler.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
