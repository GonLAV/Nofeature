import type { Response } from 'express';

/**
 * Standard JSON response envelope.
 *
 * The API contract is `{ success: boolean, data?, error? }`.
 * These helpers eliminate ad-hoc duplication and keep the shape
 * consistent across modules.
 */

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

/**
 * Operational, expected error responses (e.g. precondition fails not worth throwing).
 * For unexpected errors prefer `throw new AppError(...)` so the central error handler logs them.
 */
export function fail(res: Response, status: number, code: string, message: string, extra?: Record<string, unknown>): Response {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(extra ?? {}) },
  });
}
