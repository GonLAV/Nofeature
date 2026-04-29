import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env';
import { redis } from '../../config/redis';
import { UserRepository, User } from '../users/user.repository';
import { UnauthorizedError, ConflictError, NotFoundError } from '../../utils/errors';
import { JwtPayload } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const REFRESH_TOKEN_PREFIX = 'refresh:';
const BCRYPT_ROUNDS = 12;

export class AuthService {
  constructor(private userRepo: UserRepository) {}

  async register(data: { email: string; password: string; name: string; tenantId: string }) {
    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new ConflictError('Email already in use');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await this.userRepo.create({
      ...data,
      passwordHash,
      role: 'member',
    });

    logger.info('User registered', { userId: user.id, tenantId: data.tenantId });
    const tokens = await this.generateTokenPair(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(email: string, password: string, ip: string) {
    const user = await this.userRepo.findByEmail(email);
    if (!user) throw new UnauthorizedError('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    if (!user.is_active) throw new UnauthorizedError('Account is disabled');

    await this.userRepo.updateLastLogin(user.id, ip);
    logger.info('User logged in', { userId: user.id, ip });

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
    if (!user) throw new NotFoundError('User');

    return this.generateTokenPair(user);
  }

  async logout(userId: string) {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    logger.info('User logged out', { userId });
  }

  async revokeAllSessions(userId: string) {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    logger.warn('All sessions revoked', { userId });
  }

  private async generateTokenPair(user: { id: string; tenant_id: string; email: string; role: string }) {
    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
      jwtid: uuidv4(),
    } as SignOptions);

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
      jwtid: uuidv4(),
    } as SignOptions);

    // Store refresh token in Redis with TTL
    const ttl = 7 * 24 * 60 * 60; // 7 days
    await redis.setex(`${REFRESH_TOKEN_PREFIX}${user.id}`, ttl, refreshToken);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User) {
    const { password_hash, ...safe } = user;
    void password_hash;
    return safe;
  }
}
