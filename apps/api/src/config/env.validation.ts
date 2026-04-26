import { z } from 'zod';

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('4000'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Redis
  REDIS_URL: z.string().url().startsWith('redis://'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3002'),
  CORS_MAX_AGE_SECONDS: z.string().transform(Number).default('86400'),

  // AWS S3
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  KMS_KEY_ID: z.string().optional(),

  // Stripe — REMOVED 2026-04-25.
  //
  // Cotiza no longer holds Stripe keys. All payment operations route
  // through Dhanam's billing API (per operator directive: ONE set of
  // Stripe keys at Dhanam, every other platform funnels through it).
  //
  // Dhanam-relay envs that REPLACE these:
  DHANAM_API_URL: z.string().url(),
  DHANAM_BILLING_SECRET: z.string().min(32),
  // Bearer token for synchronous Dhanam billing API calls (e.g. POST
  // /v1/billing/upgrade for checkout URL generation). Issued by Dhanam
  // and rotated via the Wave A runbook. Required because Cotiza is the
  // billing-API CLIENT — Stripe keys live solely at Dhanam.
  DHANAM_API_TOKEN: z.string().min(16),

  // Currency
  DEFAULT_CURRENCY: z.enum(['MXN', 'USD', 'EUR']).default('MXN'),
  SUPPORTED_CURRENCIES: z.string().default('MXN,USD'),
  FX_SOURCE: z.enum(['openexchangerates', 'fixer', 'static']).default('openexchangerates'),
  OPENEXCHANGERATES_API_KEY: z.string().optional(),

  // Localization
  DEFAULT_LOCALES: z.string().default('es,en'),
  DEFAULT_LOCALE: z.enum(['es', 'en']).default('es'),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),

  // Worker Service
  WORKER_SERVICE_URL: z.string().url().default('http://localhost:8000'),

  // Rate Limiting
  RATE_LIMIT_TTL: z.string().transform(Number).default('60'),
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // Feature Flags
  ENABLE_SUPPLIER_PORTAL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  ENABLE_SUSTAINABILITY_SCORING: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  ENABLE_NDA_TRACKING: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // Quote Settings
  QUOTE_VALIDITY_DAYS: z.string().transform(Number).default('14'),
  MIN_ORDER_VALUE_MXN: z.string().transform(Number).default('500'),
  MAX_FILE_SIZE_MB: z.string().transform(Number).default('100'),

  // Timeouts
  DEFAULT_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  FILE_UPLOAD_TIMEOUT_MS: z.string().transform(Number).default('300000'),
  GEOMETRY_ANALYSIS_TIMEOUT_MS: z.string().transform(Number).default('120000'),
  ADMIN_OPERATION_TIMEOUT_MS: z.string().transform(Number).default('60000'),
  PAYMENT_TIMEOUT_MS: z.string().transform(Number).default('30000'),
  WORKER_SERVICE_TIMEOUT_MS: z.string().transform(Number).default('300000'),

  // Job Queue Settings
  JOB_QUEUE_COMPLETED_RETENTION: z.string().transform(Number).default('100'),
  JOB_QUEUE_FAILED_RETENTION: z.string().transform(Number).default('1000'),
  JOB_QUEUE_ATTEMPTS: z.string().transform(Number).default('3'),
  JOB_QUEUE_BACKOFF_DELAY_MS: z.string().transform(Number).default('2000'),
  QUOTE_CALCULATION_TIMEOUT_MS: z.string().transform(Number).default('60000'),
  FILE_ANALYSIS_TIMEOUT_MS: z.string().transform(Number).default('120000'),
  EMAIL_NOTIFICATION_TIMEOUT_MS: z.string().transform(Number).default('30000'),

  // Redis Settings
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_MAX_RETRIES_PER_REQUEST: z.string().transform(Number).default('3'),
  REDIS_RETRY_STRATEGY_MAX_MS: z.string().transform(Number).default('2000'),

  // Cache TTLs (in seconds)
  CACHE_PRICING_RULES_TTL: z.string().transform(Number).default('3600'),
  CACHE_TENANT_CONFIG_TTL: z.string().transform(Number).default('1800'),
  CACHE_USER_SESSION_TTL: z.string().transform(Number).default('900'),
  CACHE_QUOTE_CALCULATION_TTL: z.string().transform(Number).default('3600'),

  // Audit Settings
  AUDIT_LOG_DEFAULT_LIMIT: z.string().transform(Number).default('50'),
  AUDIT_LOG_EXPORT_MAX_LIMIT: z.string().transform(Number).default('10000'),

  // File Analysis Settings
  FILE_ANALYSIS_PROGRESS_INTERVAL_MS: z.string().transform(Number).default('5000'),

  // Frontend URL
  FRONTEND_URL: z.string().url().default('http://localhost:3002'),

  // Default Ports (fallback values)
  FALLBACK_API_PORT: z.string().transform(Number).default('4000'),
  FALLBACK_WEB_PORT: z.string().transform(Number).default('3002'),
  FALLBACK_WORKER_PORT: z.string().transform(Number).default('8000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  try {
    return envSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter((err) => err.message === 'Required')
        .map((err) => err.path.join('.'));

      const invalidVars = error.errors
        .filter((err) => err.message !== 'Required')
        .map((err) => `${err.path.join('.')}: ${err.message}`);

      let message = 'Environment validation failed:\n';

      if (missingVars.length > 0) {
        message += `\nMissing required variables:\n${missingVars.map((v) => `  - ${v}`).join('\n')}`;
      }

      if (invalidVars.length > 0) {
        message += `\n\nInvalid variables:\n${invalidVars.map((v) => `  - ${v}`).join('\n')}`;
      }

      throw new Error(message);
    }
    throw error;
  }
}
