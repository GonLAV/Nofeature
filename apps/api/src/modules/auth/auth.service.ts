import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env';
import { redis } from '../../config/redis';
import { UserRepository, User } from '../users/user.repository';
import { UnauthorizedError, ConflictError, NotFoundError } from '../../utils/errors';
import { JwtPayload } from '../../middleware/auth';
import { writeAudit } from '../../utils/audit';
import { logger } from '../../utils/logger';

const REFRESH_TOKEN_PREFIX  = 'refresh:';
const LOCKOUT_PREFIX        = 'lockout:';
const FAIL_COUNT_PREFIX     = 'login_fail:';
const BCRYPT_ROUNDS         = 12;
const MAX_LOGIN_FAILURES    = 10;
const LOCKOUT_DURATION_SECS = 30 * 60;   // 30 minutes
const FAIL_WINDOW_SECS      = 60 * 60;   // 1 hour tracking window

export class AuthService {
  constructor(private userRepo: UserRepository) {}

  async register(data: { email: string; password: string; name: string; tenantId: string }) {
    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new ConflictError('Email already in use');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await this.userRepo.create({ ...data, passwordHash, role: 'member' });

    logger.info('User registered', { userId: user.id, tenantId: data.tenantId });
    await writeAudit({ tenantId: data.tenantId, userId: user.id, action: 'USER_REGISTERED' });

    const tokens = await this.generateTokenPair(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(email: string, password: string, ip: string) {
    // Check account lockout
    const lockKey = `${LOCKOUT_PREFIX}${email}`;
    const locked  = await redis.get(lockKey);
    if (locked) {
      const ttl = await redis.ttl(lockKey);
      throw new UnauthorizedError(
        `Account temporarily locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minute(s).`,
      );
    }

    const user = await this.userRepo.findByEmail(email);

    // Constant-time comparison regardless of whether user exists (prevent timing oracle)
    const valid = user ? await bcrypt.compare(password, user.password_hash) : await bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000000');

    if (!user || !valid) {
      // Track failures per email
      const failKey = `${FAIL_COUNT_PREFIX}${email}`;
      const count   = await redis.incr(failKey);
      if (count === 1) await redis.expire(failKey, FAIL_WINDOW_SECS);

      if (count >= MAX_LOGIN_FAILURES) {
        await redis.setex(lockKey, LOCKOUT_DURATION_SECS, '1');
        await redis.del(failKey);
        logger.warn('Account locked after too many failures', { email, ip });
        await writeAudit({ action: 'ACCOUNT_LOCKED', metadata: { email, ip } });
      }

      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.is_active) throw new UnauthorizedError('Account is disabled');

    // Clear failure state on successful login
    await redis.del(`${FAIL_COUNT_PREFIX}${email}`);

    await this.userRepo.updateLastLogin(user.id, ip);
    logger.info('User logged in', { userId: user.id, ip });
    await writeAudit({
      tenantId: user.tenant_id,
      userId:   user.id,
      action:   'USER_LOGIN',
      ipAddress: ip,
    });

    const tokens = await this.generateTokenPair(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const stored = await redis.get(`${REFRESH_TOKEN_PREFIX}${payload.userId}`);
    if (!stored || stored !== refreshToken) throw new UnauthorizedError('Refresh token revoked');

    const user = await this.userRepo.findById(payload.userId);
    if (!user)            throw new NotFoundError('User');
    if (!user.is_active)  throw new UnauthorizedError('Account is disabled');

    return this.generateTokenPair(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedError('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userRepo.updatePasswordHash(userId, newHash);

    // Revoke all existing sessions — user must log in again
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);

    logger.info('Password changed', { userId });
    await writeAudit({ tenantId: user.tenant_id, userId, action: 'PASSWORD_CHANGED' });
  }

  async logout(userId: string) {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    logger.info('User logged out', { userId });
    await writeAudit({ userId, action: 'USER_LOGOUT' });
  }

  async revokeAllSessions(userId: string) {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    logger.warn('All sessions revoked', { userId });
  }

  private async generateTokenPair(user: {
    id: string; tenant_id: string; email: string;
    name: string; role: string; is_active: boolean;
  }) {
    const payload: JwtPayload = {
      userId:   user.id,
      tenantId: user.tenant_id,
      email:    user.email,
      name:     user.name,
      role:     user.role,
      isActive: user.is_active,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
      jwtid: uuidv4(),
    } as SignOptions);

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
      jwtid: uuidv4(),
    } as SignOptions);

    // Rotate: overwrite any previous refresh token (one active session per user)
    const ttl = 7 * 24 * 60 * 60;
    await redis.setex(`${REFRESH_TOKEN_PREFIX}${user.id}`, ttl, refreshToken);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User) {
    const { password_hash, ...safe } = user;
    void password_hash;
    return safe;
  }
}
