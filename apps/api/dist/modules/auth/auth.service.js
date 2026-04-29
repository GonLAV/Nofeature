"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const errors_1 = require("../../utils/errors");
class AuthService {
    constructor(userRepo, tenantRepo) {
        this.userRepo = userRepo;
        this.tenantRepo = tenantRepo;
    }
    async register(input) {
        const existingUser = await this.userRepo.findByEmail(input.email);
        if (existingUser) {
            throw new errors_1.ConflictError('Email already in use');
        }
        const existingTenant = await this.tenantRepo.findBySlug(input.orgSlug);
        if (existingTenant) {
            throw new errors_1.ConflictError('Organization slug already taken');
        }
        const tenant = await this.tenantRepo.create({ name: input.orgName, slug: input.orgSlug });
        const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
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
    async login(input) {
        const user = await this.userRepo.findByEmail(input.email);
        if (!user || !user.is_active) {
            throw new errors_1.UnauthorizedError('Invalid email or password');
        }
        const isValid = await bcryptjs_1.default.compare(input.password, user.password_hash);
        if (!isValid) {
            throw new errors_1.UnauthorizedError('Invalid email or password');
        }
        return this.generateTokens(user.id, user.email, user.role, user.tenant_id);
    }
    async refresh(refreshToken) {
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(refreshToken, env_1.env.JWT_REFRESH_SECRET);
        }
        catch {
            throw new errors_1.UnauthorizedError('Invalid refresh token');
        }
        const tokenHash = this.hashToken(refreshToken);
        const stored = await this.userRepo.findRefreshToken(tokenHash);
        if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
            throw new errors_1.UnauthorizedError('Refresh token is invalid or expired');
        }
        const user = await this.userRepo.findById(payload.sub);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id }, env_1.env.JWT_ACCESS_SECRET, { expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN });
        return { accessToken };
    }
    async logout(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        await this.userRepo.revokeRefreshToken(tokenHash);
    }
    async getMe(userId) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        const { password_hash: _password_hash, ...safeUser } = user;
        return safeUser;
    }
    async generateTokens(userId, email, role, tenantId) {
        const payload = { sub: userId, email, role, tenantId };
        const accessToken = jsonwebtoken_1.default.sign(payload, env_1.env.JWT_ACCESS_SECRET, {
            expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN,
        });
        const refreshToken = jsonwebtoken_1.default.sign(payload, env_1.env.JWT_REFRESH_SECRET, {
            expiresIn: env_1.env.JWT_REFRESH_EXPIRES_IN,
        });
        const tokenHash = this.hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await this.userRepo.storeRefreshToken(userId, tokenHash, expiresAt);
        return { accessToken, refreshToken };
    }
    hashToken(token) {
        return crypto_1.default.createHash('sha256').update(token).digest('hex');
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map