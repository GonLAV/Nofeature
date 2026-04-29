"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const zod_1 = require("zod");
const updateRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
});
class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
        this.list = async (req, res, next) => {
            try {
                const users = await this.usersService.listByTenant(req.user.tenantId);
                res.json({ success: true, data: users });
            }
            catch (err) {
                next(err);
            }
        };
        this.getById = async (req, res, next) => {
            try {
                const user = await this.usersService.getById(req.params.id, req.user);
                res.json({ success: true, data: user });
            }
            catch (err) {
                next(err);
            }
        };
        this.updateRole = async (req, res, next) => {
            try {
                const { role } = updateRoleSchema.parse(req.body);
                const user = await this.usersService.updateRole(req.params.id, role, req.user);
                res.json({ success: true, data: user });
            }
            catch (err) {
                next(err);
            }
        };
        this.deactivate = async (req, res, next) => {
            try {
                await this.usersService.deactivate(req.params.id, req.user);
                res.status(204).send();
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.UsersController = UsersController;
//# sourceMappingURL=users.controller.js.map