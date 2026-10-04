import { timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.js';

/** Only the voice-agent runtime, holding AGENT_API_SECRET, may call /agent/* routes. */
@Injectable()
export class AgentAuthGuard implements CanActivate {
  private readonly secret: Buffer;
  private readonly logger = new Logger('AgentAuth');

  constructor(config: ConfigService<Env, true>) {
    this.secret = Buffer.from(config.get('AGENT_API_SECRET', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const presented = Buffer.from(header.replace(/^Bearer /, ''));
    if (presented.length !== this.secret.length || !timingSafeEqual(presented, this.secret)) {
      this.logger.warn(
        `rejected ${request.method} ${request.originalUrl}: ${header ? 'wrong' : 'missing'} AGENT_API_SECRET (check the voice-agent and API use the same .env)`,
      );
      throw new UnauthorizedException();
    }
    return true;
  }
}
