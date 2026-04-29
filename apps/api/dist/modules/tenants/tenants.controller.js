"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantsController = void 0;
class TenantsController {
    constructor(tenantsService) {
        this.tenantsService = tenantsService;
        this.getMyTenant = async (req, res, next) => {
            try {
                const tenant = await this.tenantsService.getMyTenant(req.user);
                res.json({ success: true, data: tenant });
            }
            catch (err) {
                next(err);
            }
        };
        this.getById = async (req, res, next) => {
            try {
                const tenant = await this.tenantsService.getById(req.params.id, req.user);
                res.json({ success: true, data: tenant });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.TenantsController = TenantsController;
//# sourceMappingURL=tenants.controller.js.map