import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { requestLogger } from './common/request-logger.middleware.js';
import type { Env } from './config/env.js';

/** LOG_LEVEL picks the most detailed level shown: error | warn | log | debug | verbose. */
function logLevels(): LogLevel[] {
  const order: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
  const wanted = (process.env['LOG_LEVEL'] ?? 'debug') as LogLevel;
  const index = order.indexOf(wanted);
  return order.slice(0, index === -1 ? order.indexOf('debug') + 1 : index + 1);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: logLevels() });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(requestLogger);
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(
    `CORS origin ${config.get('WEB_ORIGIN', { infer: true })} · LiveKit ${config.get('LIVEKIT_URL', { infer: true })} · ` +
      `agent "${config.get('LIVEKIT_AGENT_NAME', { infer: true })}"`,
  );
}

await bootstrap();
