import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * One line per request: method, path, status, duration.
 * 5xx → error, 4xx → warn, successful GETs → verbose (the web page polls the
 * attempt every 2s, which would otherwise drown everything else), other 2xx → log.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const line = `${req.method} ${req.originalUrl} → ${res.statusCode} (${ms.toFixed(0)}ms)`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else if (req.method === 'GET' || req.method === 'OPTIONS') logger.verbose(line);
    else logger.log(line);
  });
  next();
}
