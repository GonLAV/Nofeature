import { Pool } from 'pg';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
}

export class TenantRepository {
  constructor(private readonly db: Pool) {}

  async findById(id: string): Promise<Tenant | null> {
    const result = await this.db.query<Tenant>(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await this.db.query<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1',
      [slug]
    );
    return result.rows[0] ?? null;
  }

  async create(data: { name: string; slug: string }): Promise<Tenant> {
    const result = await this.db.query<Tenant>(
      'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING *',
      [data.name, data.slug]
    );
    return result.rows[0];
  }

  async findAll(): Promise<Tenant[]> {
    const result = await this.db.query<Tenant>('SELECT * FROM tenants ORDER BY created_at DESC');
    return result.rows;
  }
}
