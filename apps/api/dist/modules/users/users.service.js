"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const errors_1 = require("../../utils/errors");
class UsersService {
    constructor(userRepo) {
        this.userRepo = userRepo;
    }
    async listByTenant(tenantId) {
        const users = await this.userRepo.findByTenantId(tenantId);
        return users.map(({ password_hash: _ph, ...u }) => u);
    }
    async getById(id, requestingUser) {
        const user = await this.userRepo.findById(id);
        if (!user)
            throw new errors_1.NotFoundError('User not found');
        if (user.tenant_id !== requestingUser.tenantId)
            throw new errors_1.ForbiddenError();
        const { password_hash: _ph, ...safeUser } = user;
        return safeUser;
    }
    async updateRole(id, role, requestingUser) {
        const user = await this.userRepo.findById(id);
        if (!user)
            throw new errors_1.NotFoundError('User not found');
        if (user.tenant_id !== requestingUser.tenantId)
            throw new errors_1.ForbiddenError();
        return this.userRepo.updateRole(id, role);
    }
    async deactivate(id, requestingUser) {
        const user = await this.userRepo.findById(id);
        if (!user)
            throw new errors_1.NotFoundError('User not found');
        if (user.tenant_id !== requestingUser.tenantId)
            throw new errors_1.ForbiddenError();
        if (id === requestingUser.sub)
            throw new errors_1.ForbiddenError('Cannot deactivate yourself');
        await this.userRepo.deactivate(id);
    }
}
exports.UsersService = UsersService;
//# sourceMappingURL=users.service.js.map