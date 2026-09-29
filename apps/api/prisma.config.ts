import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// App-local .env first, then the monorepo root .env (same order as the Nest app).
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
