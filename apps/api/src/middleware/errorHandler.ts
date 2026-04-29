import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = req.headers['x-correlation-id'] as string;

  if (err instanceof ZodError) {
    const errors = err.errors.reduce<Record<string, string[]>>((acc, issue) => {
      const key = issue.path.join('.') || 'body';
      acc[key] = [...(acc[key] ?? []), issue.message];
      return acc;
    }, {});
    res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', errors },
      correlationId,
    });
    return;
  }

  if (err instanceof ValidationError) {
    res.status(422).json({
      success: false,
      error: { code: err.code, message: err.message, errors: err.errors },
      correlationId,
    });
    return;
  }

  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', {
      code: err.code, message: err.message,
      statusCode: err.statusCode, correlationId,
      path: req.path, method: req.method,
    });
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
      correlationId,
    });
    return;
  }

  // Unexpected errors
  logger.error('Unhandled error', {
    error: err.message, stack: err.stack,
    correlationId, path: req.path, method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'An unexpected error occurred' : err.message,
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
    correlationId,
  });
};
