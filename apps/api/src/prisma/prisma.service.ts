import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');
  private readonly target: string;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('DATABASE_URL', { infer: true });
    super({
      adapter: new PrismaPg({ connectionString: url }),
      // Prisma's defaults (2s to start, 5s to run) are too tight on a loaded dev machine,
      // where they surface as P2028 and a 500 to the voice agent.
      transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    });
    this.target = describeTarget(url);
  }

  /** Connect eagerly so a wrong DATABASE_URL fails at startup, not on the first request. */
  async onModuleInit() {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.logger.log(`connected to PostgreSQL at ${this.target}`);
    } catch (error) {
      this.logger.error(
        `cannot reach PostgreSQL at ${this.target}: ${(error as Error).message}. ` +
          'Is Docker running (pnpm infra:up) and DATABASE_URL correct?',
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('disconnected from PostgreSQL');
  }
}

/** host:port/database, never the credentials. */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}
