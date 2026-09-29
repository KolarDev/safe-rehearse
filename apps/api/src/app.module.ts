import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentGatewayModule } from './agent-gateway/agent-gateway.module.js';
import { validateEnv } from './config/env.js';
import { CourseModule } from './course/course.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StageAttemptsModule } from './stage-attempts/stage-attempts.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // App-local .env first, then the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    CourseModule,
    StageAttemptsModule,
    AgentGatewayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
