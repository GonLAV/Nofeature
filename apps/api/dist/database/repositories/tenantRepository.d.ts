import { Pool } from 'pg';
export interface Tenant {
    id: string;
    name: string;
    slug: string;
    created_at: Date;
}
export declare class TenantRepository {
    private readonly db;
    constructor(db: Pool);
    findById(id: string): Promise<Tenant | null>;
    findBySlug(slug: string): Promise<Tenant | null>;
    create(data: {
        name: string;
        slug: string;
    }): Promise<Tenant>;
    findAll(): Promise<Tenant[]>;
}
//# sourceMappingURL=tenantRepository.d.ts.map