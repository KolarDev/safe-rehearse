import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // App-local .env first, then the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
