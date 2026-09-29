import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface KnowledgeItem {
  title: string;
  content: string;
}

/**
 * Selects the course knowledge an agent gets for a stage. Today it returns the
 * stage's knowledge chunks in order. This is the seam where pgvector retrieval
 * will slot in, without the agent or the model provider changing.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async forStage(stageId: string): Promise<KnowledgeItem[]> {
    return this.prisma.knowledgeChunk.findMany({
      where: { stageId },
      orderBy: { position: 'asc' },
      select: { title: true, content: true },
    });
  }
}
