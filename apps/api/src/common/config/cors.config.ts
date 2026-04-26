import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';

export function createCorsConfig(configService: ConfigService): CorsOptions {
  const nodeEnv = configService.get('NODE_ENV', 'development');
  const allowedOrigins = configService.get('ALLOWED_ORIGINS', '').split(',').filter(Boolean);

  // Development defaults
  const webPort = configService.get<number>('FALLBACK_WEB_PORT', 3002);
  const devOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    `http://localhost:${webPort}`,
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    `http://127.0.0.1:${webPort}`,
  ];

  const origin =
    nodeEnv === 'production'
      ? allowedOrigins.length > 0
        ? allowedOrigins
        : false
      : [...devOrigins, ...allowedOrigins];

  return {
    origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Tenant-ID',
      'X-API-Key',
      'X-Client-Version',
      'X-Request-ID',
      'Cache-Control',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page',
      'X-Per-Page',
      'X-Request-ID',
      'X-Rate-Limit-Limit',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
    credentials: true,
    maxAge: configService.get<number>('CORS_MAX_AGE_SECONDS', 86400),
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
}

import { Request, Response, NextFunction } from 'express';

// Pre-flight request handler
export function handlePreflightRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Tenant-ID, X-API-Key',
    );
    res.header('Access-Control-Max-Age', '86400'); // TODO: Make this configurable
    res.sendStatus(204);
    return;
  }
  next();
}
