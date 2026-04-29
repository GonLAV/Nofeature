import { TenantRepository } from '../../database/repositories/tenantRepository';
import { JwtPayload } from '../../middleware/auth';
export declare class TenantsService {
    private readonly tenantRepo;
    constructor(tenantRepo: TenantRepository);
    getById(id: string, requestingUser: JwtPayload): Promise<import("../../database/repositories/tenantRepository").Tenant>;
    getMyTenant(requestingUser: JwtPayload): Promise<import("../../database/repositories/tenantRepository").Tenant>;
}
//# sourceMappingURL=tenants.service.d.ts.map