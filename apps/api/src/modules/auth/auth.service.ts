import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRepository } from '../../database/repositories/userRepository';
import { TenantRepository } from '../../database/repositories/tenantRepository';
import { env } from '../../config/env';
import { UnauthorizedError, ConflictError, NotFoundError } from '../../utils/errors';
import { JwtPayload, UserRole } from '../../middleware/auth';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  orgName: string;
  orgSlug: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tenantRepo: TenantRepository
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existingUser = await this.userRepo.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Email already in use');
    }

    const existingTenant = await this.tenantRepo.findBySlug(input.orgSlug);
    if (existingTenant) {
      throw new ConflictError('Organization slug already taken');
    }

    const tenant = await this.tenantRepo.create({ name: input.orgName, slug: input.orgSlug });
    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.userRepo.create({
      tenantId: tenant.id,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'owner',
    });

    return this.generateTokens(user.id, user.email, user.role, tenant.id);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    return this.generateTokens(user.id, user.email, user.role, user.tenant_id);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.userRepo.findRefreshToken(tokenHash);
    if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token is invalid or expired');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    return { accessToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.userRepo.revokeRefreshToken(tokenHash);
  }

  async getMe(userId: string): Promise<Omit<import('../../database/repositories/userRepository').User, 'password_hash'>> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const { password_hash: _password_hash, ...safeUser } = user;
    return safeUser;
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    tenantId: string
  ): Promise<AuthTokens> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, email, role, tenantId };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.userRepo.storeRefreshToken(userId, tokenHash, expiresAt);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
