import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../../src/utils/errors';

describe('Error classes', () => {
  it('AppError defaults to 500 and isOperational=true', () => {
    const e = new AppError('boom');
    expect(e.statusCode).toBe(500);
    expect(e.isOperational).toBe(true);
    expect(e.message).toBe('boom');
    expect(e).toBeInstanceOf(Error);
  });

  it('AppError accepts custom statusCode + code', () => {
    const e = new AppError('x', 418, 'TEAPOT');
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
  });

  it('NotFoundError → 404 with NOT_FOUND', () => {
    const e = new NotFoundError('Widget');
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toMatch(/Widget/);
  });

  it('UnauthorizedError → 401', () => {
    const e = new UnauthorizedError();
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError → 403', () => {
    const e = new ForbiddenError('nope');
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
    expect(e.message).toBe('nope');
  });

  it('ValidationError → 422 with errors map', () => {
    const e = new ValidationError({ email: ['required'] });
    expect(e.statusCode).toBe(422);
    expect(e.errors).toEqual({ email: ['required'] });
  });

  it('ConflictError → 409', () => {
    const e = new ConflictError('dup');
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('CONFLICT');
  });
});
