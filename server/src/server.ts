import http from 'http';
import { env } from './config/env';
import { connectDB } from './config/db';
import { createApp } from './app';
import { initSocket } from './socket';
import { startScheduler } from './jobs/scheduler';
import { logger } from './config/logger';

async function bootstrap() {
  await connectDB();
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.PORT, () => {
    logger.info(`AgencyFlow API listening on http://localhost:${env.PORT} (docs: /api/docs)`);
    logger.info({ email: env.mailEnabled, ai: env.aiEnabled, cloudinary: env.cloudinaryEnabled }, 'Optional integrations');
  });
  startScheduler();

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
