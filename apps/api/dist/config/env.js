"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('4000').transform(Number),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: zod_1.z.string().min(1, 'REDIS_URL is required'),
    JWT_ACCESS_SECRET: zod_1.z.string().min(1, 'JWT_ACCESS_SECRET is required'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(1, 'JWT_REFRESH_SECRET is required'),
    JWT_ACCESS_EXPIRES_IN: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('7d'),
    ANTHROPIC_API_KEY: zod_1.z.string().default(''),
    ENCRYPTION_KEY: zod_1.z.string().default(''),
    SLACK_BOT_TOKEN: zod_1.z.string().default(''),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:3000'),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    if (process.env.NODE_ENV !== 'test') {
        console.error('Invalid environment variables:', parsed.error.format());
        process.exit(1);
    }
}
exports.env = parsed.success
    ? parsed.data
    : {
        NODE_ENV: 'test',
        PORT: 4000,
        DATABASE_URL: 'postgresql://localhost/test',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        ANTHROPIC_API_KEY: '',
        ENCRYPTION_KEY: '',
        SLACK_BOT_TOKEN: '',
        CORS_ORIGIN: 'http://localhost:3000',
    };
//# sourceMappingURL=env.js.map