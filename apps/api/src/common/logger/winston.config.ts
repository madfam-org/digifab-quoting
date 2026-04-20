import * as winston from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Custom format for JSON logs
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Custom format for console logs in development
const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.ms(),
  winston.format.errors({ stack: true }),
  nestWinstonModuleUtilities.format.nestLike('Cotiza Studio', {
    prettyPrint: true,
    colors: true,
  }),
);

// Define log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    verbose: 5,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    verbose: 'cyan',
  },
};

// Create Winston logger instance
export const createWinstonLogger = () => {
  const transports: winston.transport[] = [];

  // Console transport
  if (!isProduction || process.env.LOG_TO_CONSOLE === 'true') {
    transports.push(
      new winston.transports.Console({
        format: isDevelopment ? consoleFormat : jsonFormat,
        level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
      }),
    );
  }

  // File transport in production — write to a path the non-root runtime
  // user (uid 1001) can actually create. `/app/apps/api/logs/` is
  // root-owned in the runner image. `/tmp/logs/` is writable by any
  // uid. Operators collect logs via stdout → Loki/Fluent Bit anyway,
  // so the file transport is just a local backup. Opt out entirely
  // by setting LOG_TO_FILE=false in the env.
  if (isProduction && process.env.LOG_TO_FILE !== 'false') {
    const logDir = process.env.LOG_DIR || '/tmp/logs';
    transports.push(
      new winston.transports.File({
        filename: `${logDir}/error.log`,
        level: 'error',
        format: jsonFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
    );

    transports.push(
      new winston.transports.File({
        filename: `${logDir}/combined.log`,
        format: jsonFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      }),
    );
  }

  // Create logger
  const logger = winston.createLogger({
    levels: customLevels.levels,
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    format: jsonFormat,
    transports,
    exitOnError: false,
  });

  // Add colors to winston
  winston.addColors(customLevels.colors);

  return logger;
};

// Logger middleware for Express/NestJS
import { Request, Response, NextFunction } from 'express';

export const createLoggerMiddleware = (logger: winston.Logger) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    // Log request
    logger.http('Incoming request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Log response
    const originalSend = res.send;
    res.send = function (data: unknown): Response {
      const responseTime = Date.now() - start;

      logger.http('Outgoing response', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
      });

      return originalSend.call(this, data);
    };

    next();
  };
};
