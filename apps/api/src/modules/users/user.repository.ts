import db from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    return rows[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  async findByTenant(tenantId: string) {
    const { rows } = await db.query(
      'SELECT id, email, name, role, is_active, created_at FROM users WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [tenantId]
    );
    return rows;
  }

  async create(data: { email: string; passwordHash: string; name: string; tenantId: string; role: string }): Promise<User> {
    const { rows } = await db.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), data.tenantId, data.email, data.passwordHash, data.name, data.role]
    );
    return rows[0];
  }

  async updateLastLogin(id: string, ip: string) {
    await db.query(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = $2 WHERE id = $1',
      [id, ip]
    );
  }

  async update(id: string, tenantId: string, data: Partial<{ name: string; role: string; is_active: boolean }>) {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (data.name !== undefined)      { sets.push(`name = $${i++}`);      values.push(data.name); }
    if (data.role !== undefined)      { sets.push(`role = $${i++}`);      values.push(data.role); }
    if (data.is_active !== undefined) { sets.push(`is_active = $${i++}`); values.push(data.is_active); }
    if (!sets.length) return null;
    sets.push(`updated_at = NOW()`);
    values.push(id, tenantId);
    const { rows } = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++} RETURNING id, email, name, role, is_active`,
      values
    );
    return rows[0] || null;
  }

  async softDelete(id: string, tenantId: string) {
    await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
  }
}
