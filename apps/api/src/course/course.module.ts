import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service.js';
import { StagesController } from './stages.controller.js';

@Module({
  controllers: [StagesController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class CourseModule {}
