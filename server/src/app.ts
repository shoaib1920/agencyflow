import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { sendSuccess } from './utils/response';
import { buildOpenApi } from './docs/openapi';

const limitMessage = (message: string) => ({ success: false, data: null, message, meta: null });

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Render / Vercel sit behind a proxy
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' }, // Render pings health every 5s
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Local upload fallback (when Cloudinary keys are not set)
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/api/health', (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      features: { email: env.mailEnabled, ai: env.aiEnabled, cloudinary: env.cloudinaryEnabled },
    });
  });

  // Interactive API docs generated from the route registry
  app.get('/api/docs.json', (req, res) => res.json(buildOpenApi(`${req.protocol}://${req.get('host')}`)));
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(undefined, { swaggerOptions: { url: '/api/docs.json', persistAuthorization: true }, customSiteTitle: 'AgencyFlow API' }),
  );

  // Rate limits: strict on auth (brute force), generous on everything else (abuse/scraping)
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.isTest ? 1000 : 100,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: limitMessage('Too many attempts, try again later'),
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: env.isTest ? 10_000 : 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: limitMessage('Too many requests, slow down a little'),
    }),
  );

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
