"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantsService = void 0;
const errors_1 = require("../../utils/errors");
class TenantsService {
    constructor(tenantRepo) {
        this.tenantRepo = tenantRepo;
    }
    async getById(id, requestingUser) {
        if (id !== requestingUser.tenantId && requestingUser.role !== 'owner') {
            throw new errors_1.ForbiddenError();
        }
        const tenant = await this.tenantRepo.findById(id);
        if (!tenant)
            throw new errors_1.NotFoundError('Tenant not found');
        return tenant;
    }
    async getMyTenant(requestingUser) {
        const tenant = await this.tenantRepo.findById(requestingUser.tenantId);
        if (!tenant)
            throw new errors_1.NotFoundError('Tenant not found');
        return tenant;
    }
}
exports.TenantsService = TenantsService;
//# sourceMappingURL=tenants.service.js.map