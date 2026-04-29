"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
class UserRepository {
    constructor(db) {
        this.db = db;
    }
    async findById(id) {
        const result = await this.db.query('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [id]);
        return result.rows[0] ?? null;
    }
    async findByEmail(email) {
        const result = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] ?? null;
    }
    async create(data) {
        const result = await this.db.query(`INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [data.tenantId, data.email, data.passwordHash, data.firstName, data.lastName, data.role ?? 'member']);
        return result.rows[0];
    }
    async findByTenantId(tenantId) {
        const result = await this.db.query('SELECT * FROM users WHERE tenant_id = $1 AND is_active = TRUE ORDER BY created_at DESC', [tenantId]);
        return result.rows;
    }
    async updateRole(id, role) {
        const result = await this.db.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING *', [role, id]);
        return result.rows[0] ?? null;
    }
    async deactivate(id) {
        await this.db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
    }
    async storeRefreshToken(userId, tokenHash, expiresAt) {
        await this.db.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, tokenHash, expiresAt]);
    }
    async findRefreshToken(tokenHash) {
        const result = await this.db.query('SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
        return result.rows[0] ?? null;
    }
    async revokeRefreshToken(tokenHash) {
        await this.db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=userRepository.js.map