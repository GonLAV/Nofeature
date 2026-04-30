import winston from 'winston';
import { config } from '../config/env';
import { getContext } from './requestContext';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

/**
 * Mixes the active request context (correlationId, userId, tenantId,
 * route, ...) into every log line. Lives at the format layer so it
 * wraps *every* call site without code changes.
 *
 * Falls back to a no-op when called outside an HTTP request (e.g. at
 * server boot, or from a worker), so general-purpose logging still
 * works.
 */
const contextFormat = winston.format((info) => {
  const ctx = getContext();
  if (!ctx) return info;
  return {
    ...info,
    correlationId: ctx.correlationId,
    ...(ctx.userId    ? { userId:    ctx.userId    } : {}),
    ...(ctx.tenantId  ? { tenantId:  ctx.tenantId  } : {}),
    ...(ctx.role      ? { role:      ctx.role      } : {}),
    ...(ctx.method    ? { method:    ctx.method    } : {}),
    ...(ctx.route     ? { route:     ctx.route     } : {}),
  };
});

const devFormat = combine(
  contextFormat(),
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length) log += ` ${JSON.stringify(meta)}`;
    if (stack) log += `\n${stack}`;
    return log;
  })
);

const prodFormat = combine(
  contextFormat(),
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  format: config.isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'incident-war-room-api' },
  transports: [
    new winston.transports.Console(),
    ...(config.isProduction ? [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ] : []),
  ],
});
