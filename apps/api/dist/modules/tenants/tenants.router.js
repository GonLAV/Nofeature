"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantsRouter = void 0;
const express_1 = require("express");
const database_1 = require("../../config/database");
const tenantRepository_1 = require("../../database/repositories/tenantRepository");
const tenants_service_1 = require("./tenants.service");
const tenants_controller_1 = require("./tenants.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
exports.tenantsRouter = router;
const tenantRepo = new tenantRepository_1.TenantRepository(database_1.pool);
const tenantsService = new tenants_service_1.TenantsService(tenantRepo);
const tenantsController = new tenants_controller_1.TenantsController(tenantsService);
router.use(auth_1.authenticate);
router.get('/me', tenantsController.getMyTenant);
router.get('/:id', tenantsController.getById);
//# sourceMappingURL=tenants.router.js.map