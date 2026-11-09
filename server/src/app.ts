import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { sendSuccess } from './utils/response';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Render / Vercel sit behind a proxy
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Local upload fallback (when Cloudinary keys are not set)
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/api/health', (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  // Brute-force protection on auth endpoints only
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.isTest ? 1000 : 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, data: null, message: 'Too many attempts, try again later', meta: null },
  });
  app.use('/api/auth', authLimiter);

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
