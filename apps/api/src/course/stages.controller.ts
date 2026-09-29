import { Controller, Get } from '@nestjs/common';
import type { StageSummary } from '@safe-rehearse/types';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('stages')
export class StagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<StageSummary[]> {
    return this.prisma.stage.findMany({
      orderBy: [{ scenario: { title: 'asc' } }, { position: 'asc' }],
      select: {
        id: true,
        title: true,
        position: true,
        scenario: { select: { id: true, title: true } },
      },
    });
  }
}
