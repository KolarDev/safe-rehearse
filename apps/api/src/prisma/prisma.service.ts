import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
      // Prisma's defaults (2s to start, 5s to run) are too tight on a loaded dev machine,
      // where they surface as P2028 and a 500 to the voice agent.
      transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
