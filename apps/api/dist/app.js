"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_router_1 = require("./modules/auth/auth.router");
const incidents_router_1 = require("./modules/incidents/incidents.router");
const ai_router_1 = require("./modules/ai/ai.router");
const users_router_1 = require("./modules/users/users.router");
const tenants_router_1 = require("./modules/tenants/tenants.router");
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: env_1.env.CORS_ORIGIN, credentials: true }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use(rateLimiter_1.generalLimiter);
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    app.use('/api/v1/auth', auth_router_1.authRouter);
    app.use('/api/v1/incidents', incidents_router_1.incidentsRouter);
    app.use('/api/v1/ai', ai_router_1.aiRouter);
    app.use('/api/v1/users', users_router_1.usersRouter);
    app.use('/api/v1/tenants', tenants_router_1.tenantsRouter);
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map