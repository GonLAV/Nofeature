"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const zod_1 = require("zod");
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    orgName: zod_1.z.string().min(1),
    orgSlug: zod_1.z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
class AuthController {
    constructor(authService) {
        this.authService = authService;
        this.register = async (req, res, next) => {
            try {
                const input = registerSchema.parse(req.body);
                const tokens = await this.authService.register(input);
                res.status(201).json({ success: true, data: tokens });
            }
            catch (err) {
                next(err);
            }
        };
        this.login = async (req, res, next) => {
            try {
                const input = loginSchema.parse(req.body);
                const tokens = await this.authService.login(input);
                res.json({ success: true, data: tokens });
            }
            catch (err) {
                next(err);
            }
        };
        this.refresh = async (req, res, next) => {
            try {
                const { refreshToken } = refreshSchema.parse(req.body);
                const result = await this.authService.refresh(refreshToken);
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.logout = async (req, res, next) => {
            try {
                const { refreshToken } = refreshSchema.parse(req.body);
                await this.authService.logout(refreshToken);
                res.json({ success: true, message: 'Logged out successfully' });
            }
            catch (err) {
                next(err);
            }
        };
        this.me = async (req, res, next) => {
            try {
                const user = await this.authService.getMe(req.user.sub);
                res.json({ success: true, data: user });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map