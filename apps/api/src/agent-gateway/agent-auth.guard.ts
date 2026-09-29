import { timingSafeEqual } from 'node:crypto';
import {
  Injectable,
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

  constructor(config: ConfigService<Env, true>) {
    this.secret = Buffer.from(config.get('AGENT_API_SECRET', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const presented = Buffer.from(header.replace(/^Bearer /, ''));
    if (presented.length !== this.secret.length || !timingSafeEqual(presented, this.secret)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
