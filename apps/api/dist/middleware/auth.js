"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const errors_1 = require("../utils/errors");
function authenticate(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next(new errors_1.UnauthorizedError('No token provided'));
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        req.user = payload;
        next();
    }
    catch {
        next(new errors_1.UnauthorizedError('Invalid or expired token'));
    }
}
const roleHierarchy = {
    viewer: 1,
    member: 2,
    manager: 3,
    admin: 4,
    owner: 5,
};
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new errors_1.UnauthorizedError());
        }
        const userLevel = roleHierarchy[req.user.role];
        const required = Math.min(...roles.map((r) => roleHierarchy[r]));
        if (userLevel < required) {
            return next(new errors_1.ForbiddenError('Insufficient permissions'));
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map