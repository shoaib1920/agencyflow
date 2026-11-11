import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logs in production (easy to search in Render's log viewer),
 * pretty single-line logs in development, silent in tests.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(env.isProd || env.isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname', singleLine: true },
        },
      }),
});
