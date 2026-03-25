type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: unknown): void;
}

function log(level: LogLevel, namespace: string, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${namespace}]`;

  if (level === 'error') {
    console.error(prefix, message, meta ?? '');
  } else if (level === 'warn') {
    console.warn(prefix, message, meta ?? '');
  } else if (level === 'debug' && process.env.NODE_ENV !== 'production') {
    console.debug(prefix, message, meta ?? '');
  } else if (level === 'info') {
    console.log(prefix, message, meta ?? '');
  }
}

export function getLogger(namespace: string): Logger {
  return {
    debug: (message, meta) => log('debug', namespace, message, meta),
    info: (message, meta) => log('info', namespace, message, meta),
    warn: (message, meta) => log('warn', namespace, message, meta),
    error: (message, meta) => log('error', namespace, message, meta),
  };
}
