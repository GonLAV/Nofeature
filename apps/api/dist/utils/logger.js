"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const env_1 = require("../config/env");
const { combine, timestamp, errors, json, colorize, simple } = winston_1.default.format;
exports.logger = winston_1.default.createLogger({
    level: env_1.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(timestamp(), errors({ stack: true }), json()),
    defaultMeta: { service: 'war-room-api' },
    transports: [
        new winston_1.default.transports.Console({
            format: env_1.env.NODE_ENV === 'production'
                ? combine(timestamp(), json())
                : combine(colorize(), simple()),
        }),
    ],
});
//# sourceMappingURL=logger.js.map