import pino from 'pino';
import type { AppConfig } from './types.js';

let logger: pino.Logger | undefined;

export function initLogger(config: Pick<AppConfig, 'logLevel'>): pino.Logger {
  logger = pino({
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  });
  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = pino({ level: 'info' });
  }
  return logger;
}
