import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema } from 'zod';

/**
 * Validates a request part against a Zod schema and replaces the original
 * with the parsed (and coerced) value. Throws ZodError on failure, which
 * the central errorHandler converts into a 422 with field errors.
 *
 *   router.post('/', validate(MySchema), asyncHandler(...))
 *
 * `where` defaults to 'body'; pass 'query' or 'params' for those.
 */
export const validate =
  <T>(schema: ZodSchema<T>, where: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[where]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[where] = parsed;
    next();
  };

export default validate;
