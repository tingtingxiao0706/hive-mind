import type { Logger } from '../types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export function createLogger(level: LogLevel = 'warn'): Logger {
  const threshold = LOG_LEVELS[level];

  const log = (lvl: LogLevel, message: string, ...args: unknown[]) => {
    if (LOG_LEVELS[lvl] >= threshold) {
      const prefix = `[hive-mind:${lvl}]`;
      const method = lvl === 'debug' ? 'log' : lvl === 'silent' ? 'log' : lvl;
      console[method](prefix, message, ...args);
    }
  };

  return {
    debug: (msg, ...args) => log('debug', msg, ...args),
    info: (msg, ...args) => log('info', msg, ...args),
    warn: (msg, ...args) => log('warn', msg, ...args),
    error: (msg, ...args) => log('error', msg, ...args),
  };
}
