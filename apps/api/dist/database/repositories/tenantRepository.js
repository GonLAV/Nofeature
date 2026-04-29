"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantRepository = void 0;
class TenantRepository {
    constructor(db) {
        this.db = db;
    }
    async findById(id) {
        const result = await this.db.query('SELECT * FROM tenants WHERE id = $1', [id]);
        return result.rows[0] ?? null;
    }
    async findBySlug(slug) {
        const result = await this.db.query('SELECT * FROM tenants WHERE slug = $1', [slug]);
        return result.rows[0] ?? null;
    }
    async create(data) {
        const result = await this.db.query('INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING *', [data.name, data.slug]);
        return result.rows[0];
    }
    async findAll() {
        const result = await this.db.query('SELECT * FROM tenants ORDER BY created_at DESC');
        return result.rows;
    }
}
exports.TenantRepository = TenantRepository;
//# sourceMappingURL=tenantRepository.js.map