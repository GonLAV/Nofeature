import { Pool } from 'pg';
import { UserRole } from '../../middleware/auth';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type CreateUserData = {
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
};

export class UserRepository {
  constructor(private readonly db: Pool) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] ?? null;
  }

  async create(data: CreateUserData): Promise<User> {
    const result = await this.db.query<User>(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.tenantId, data.email, data.passwordHash, data.firstName, data.lastName, data.role ?? 'member']
    );
    return result.rows[0];
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE tenant_id = $1 AND is_active = TRUE ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  }

  async updateRole(id: string, role: UserRole): Promise<User | null> {
    const result = await this.db.query<User>(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING *',
      [role, id]
    );
    return result.rows[0] ?? null;
  }

  async deactivate(id: string): Promise<void> {
    await this.db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
  }

  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );
  }

  async findRefreshToken(tokenHash: string): Promise<{ user_id: string; expires_at: Date; revoked_at: Date | null } | null> {
    const result = await this.db.query<{ user_id: string; expires_at: Date; revoked_at: Date | null }>(
      'SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );
  }
}
