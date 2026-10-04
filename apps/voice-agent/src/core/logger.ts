import { log as livekitLog } from '@livekit/agents';

type Fields = Record<string, unknown>;
type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

/**
 * Scoped logger. Inside a LiveKit worker it writes through LiveKit's logger, so our
 * lines carry the same job/room context and formatting as the framework's. Outside
 * one (the simulator, scripts) LiveKit's logger is not initialised, so it falls
 * back to the console.
 */
export function createLogger(scope: string, base: Fields = {}): Logger {
  const write = (level: Level, msg: string, fields: Fields = {}) => {
    const data = { scope, ...base, ...fields };
    try {
      livekitLog().child(data)[level](msg);
    } catch {
      const line = `[${scope}] ${msg}`;
      const extra = { ...base, ...fields };
      const args = Object.keys(extra).length > 0 ? [line, extra] : [line];
      if (level === 'error') console.error(...args);
      else if (level === 'warn') console.warn(...args);
      else if (level === 'info') console.log(...args);
      else if (process.env.LOG_LEVEL === 'debug') console.debug(...args);
    }
  };

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (fields) => createLogger(scope, { ...base, ...fields }),
  };
}

/** Turns anything thrown into loggable fields. */
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) {
    return { error: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  }
  return { error: String(error) };
}
