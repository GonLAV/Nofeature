"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const zod_1 = require("zod");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        const errors = {};
        for (const issue of err.issues) {
            const path = issue.path.join('.');
            if (!errors[path])
                errors[path] = [];
            errors[path].push(issue.message);
        }
        res.status(400).json({
            success: false,
            error: 'Validation failed',
            errors,
        });
        return;
    }
    if (err instanceof errors_1.ValidationError) {
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
            errors: err.errors,
        });
        return;
    }
    if (err instanceof errors_1.AppError) {
        if (!err.isOperational) {
            logger_1.logger.error('Non-operational error:', err);
        }
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
        });
        return;
    }
    logger_1.logger.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
}
function notFoundHandler(_req, res) {
    res.status(404).json({ success: false, error: 'Route not found' });
}
//# sourceMappingURL=errorHandler.js.map