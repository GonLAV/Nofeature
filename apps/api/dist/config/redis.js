"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.connectRedis = connectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
exports.redis = new ioredis_1.default(env_1.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 3)
            return null;
        return Math.min(times * 200, 1000);
    },
});
exports.redis.on('error', (err) => {
    logger_1.logger.warn('Redis connection error:', err.message);
});
exports.redis.on('connect', () => {
    logger_1.logger.info('Redis connected successfully');
});
async function connectRedis() {
    await exports.redis.connect();
}
//# sourceMappingURL=redis.js.map