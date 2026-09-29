import { Module } from '@nestjs/common';
import { CourseModule } from '../course/course.module.js';
import { StageAttemptsModule } from '../stage-attempts/stage-attempts.module.js';
import { AgentAuthGuard } from './agent-auth.guard.js';
import { AgentContextService } from './agent-context.service.js';
import { AgentGatewayController } from './agent-gateway.controller.js';

@Module({
  imports: [CourseModule, StageAttemptsModule],
  controllers: [AgentGatewayController],
  providers: [AgentContextService, AgentAuthGuard],
})
export class AgentGatewayModule {}
