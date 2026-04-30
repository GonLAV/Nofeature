import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so that any thrown / rejected error
 * is forwarded to Express's error middleware via next(err).
 *
 * Eliminates the try/catch-with-next(e) boilerplate from every route.
 *
 * Usage:
 *   router.get('/x', asyncHandler(async (req, res) => {
 *     const data = await svc.load();
 *     res.json({ success: true, data });
 *   }));
 */
export const asyncHandler =
  <Req extends Request = Request, Res extends Response = Response>(
    fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as Req, res as Res, next)).catch(next);
  };

export default asyncHandler;
