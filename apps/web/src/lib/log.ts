/**
 * Browser console logger with a coloured, scoped prefix, e.g. "[SafeRehearse:room] connected".
 * debug lines appear under Chrome DevTools' "Verbose" level.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const COLOURS: Record<Level, string> = {
  debug: '#64748b',
  info: '#0f766e',
  warn: '#b45309',
  error: '#be123c',
};

export function createLogger(scope: string) {
  const write = (level: Level, message: string, data?: unknown) => {
    const prefix = `%c[SafeRehearse:${scope}]%c ${message}`;
    const styles = [`color:${COLOURS[level]};font-weight:600`, 'color:inherit'];
    const args = data === undefined ? [prefix, ...styles] : [prefix, ...styles, data];
    console[level](...args);
  };
  return {
    debug: (message: string, data?: unknown) => write('debug', message, data),
    info: (message: string, data?: unknown) => write('info', message, data),
    warn: (message: string, data?: unknown) => write('warn', message, data),
    error: (message: string, data?: unknown) => write('error', message, data),
  };
}
