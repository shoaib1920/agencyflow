import 'dotenv/config';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/agencyflow'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-please'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,
  // Email (any SMTP provider: Resend, Brevo, Gmail app password, Mailtrap...)
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: z.string().default('AgencyFlow <no-reply@agencyflow.dev>'),
  // Claude API for AI lead assist
  ANTHROPIC_API_KEY: optional,
  // Background jobs (reminder emails, trash purge)
  CRON_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  LOG_LEVEL: z.string().default('info'),
  /** Override cookie security (e.g. 'false' for docker compose over plain http). Defaults to production. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

// API_PORT wins over PORT so tools that inject PORT for the frontend dev server
// (or a shell with PORT already set) don't move the API. Hosts like Render set only PORT.
const parsed = envSchema.safeParse({
  ...process.env,
  PORT: process.env.API_PORT ?? process.env.PORT,
});
if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const clientOrigins = parsed.data.CLIENT_URL.split(',').map((o) => o.trim());

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  clientOrigins,
  /** Base URL used in emails and invite links. */
  appUrl: clientOrigins[0] ?? 'http://localhost:5173',
  cloudinaryEnabled: Boolean(
    parsed.data.CLOUDINARY_CLOUD_NAME &&
      parsed.data.CLOUDINARY_API_KEY &&
      parsed.data.CLOUDINARY_API_SECRET,
  ),
  mailEnabled: Boolean(parsed.data.SMTP_HOST),
  cookieSecure: parsed.data.COOKIE_SECURE ? parsed.data.COOKIE_SECURE === 'true' : parsed.data.NODE_ENV === 'production',
  aiEnabled: Boolean(parsed.data.ANTHROPIC_API_KEY),
};
