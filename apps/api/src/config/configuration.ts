import { validateEnv } from './env.validation';

export default () => {
  // Validate environment variables on startup
  const validatedConfig = validateEnv(process.env);

  return {
    env: validatedConfig.NODE_ENV,
    port: validatedConfig.PORT,

    database: {
      url: validatedConfig.DATABASE_URL,
    },

    redis: {
      url: validatedConfig.REDIS_URL,
    },

    jwt: {
      secret: validatedConfig.JWT_SECRET,
      accessTokenExpiry: validatedConfig.JWT_EXPIRES_IN,
      refreshTokenExpiry: validatedConfig.REFRESH_TOKEN_EXPIRES_IN,
    },

    cors: {
      origins: validatedConfig.ALLOWED_ORIGINS.split(','),
    },

    aws: {
      region: validatedConfig.AWS_REGION,
      s3: {
        bucket: validatedConfig.S3_BUCKET,
        region: validatedConfig.AWS_REGION,
        accessKeyId: validatedConfig.S3_ACCESS_KEY_ID,
        secretAccessKey: validatedConfig.S3_SECRET_ACCESS_KEY,
      },
      kms: {
        keyId: validatedConfig.KMS_KEY_ID,
      },
    },

    // Dhanam billing relay (replaces direct Stripe per 2026-04-25 directive)
    dhanam: {
      apiUrl: validatedConfig.DHANAM_API_URL,
      billingSecret: validatedConfig.DHANAM_BILLING_SECRET,
    },

    currency: {
      default: validatedConfig.DEFAULT_CURRENCY,
      supported: validatedConfig.SUPPORTED_CURRENCIES.split(','),
      fxSource: validatedConfig.FX_SOURCE,
      openExchangeRatesApiKey: validatedConfig.OPENEXCHANGERATES_API_KEY,
    },

    localization: {
      defaultLocale: validatedConfig.DEFAULT_LOCALE,
      supportedLocales: validatedConfig.DEFAULT_LOCALES.split(','),
    },

    email: {
      from: 'innovacionesmadfam@proton.me',
      smtp: {
        host: validatedConfig.SMTP_HOST,
        port: validatedConfig.SMTP_PORT,
        user: validatedConfig.SMTP_USER,
        pass: validatedConfig.SMTP_PASS,
      },
    },

    worker: {
      geometryServiceUrl: validatedConfig.WORKER_SERVICE_URL,
    },

    rateLimit: {
      ttl: validatedConfig.RATE_LIMIT_TTL,
      max: validatedConfig.RATE_LIMIT_MAX,
    },

    logging: {
      level: validatedConfig.LOG_LEVEL,
      format: validatedConfig.LOG_FORMAT,
    },

    features: {
      supplierPortal: validatedConfig.ENABLE_SUPPLIER_PORTAL,
      sustainabilityScoring: validatedConfig.ENABLE_SUSTAINABILITY_SCORING,
      ndaTracking: validatedConfig.ENABLE_NDA_TRACKING,
    },

    defaults: {
      currency: validatedConfig.DEFAULT_CURRENCY,
      locale: validatedConfig.DEFAULT_LOCALE,
      quoteValidityDays: validatedConfig.QUOTE_VALIDITY_DAYS,
      minOrderValueMXN: validatedConfig.MIN_ORDER_VALUE_MXN,
      maxFileSizeMB: validatedConfig.MAX_FILE_SIZE_MB,
    },

    fx: {
      provider: validatedConfig.FX_SOURCE,
      apiKey: validatedConfig.OPENEXCHANGERATES_API_KEY,
    },
  };
};
