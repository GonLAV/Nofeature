"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
async function main() {
    try {
        await (0, database_1.connectDatabase)();
        await (0, redis_1.connectRedis)();
    }
    catch (err) {
        logger_1.logger.warn('Could not connect to services, continuing anyway:', err);
    }
    const app = (0, app_1.createApp)();
    const server = app.listen(env_1.env.PORT, () => {
        logger_1.logger.info(`Server running on port ${env_1.env.PORT} in ${env_1.env.NODE_ENV} mode`);
    });
    const shutdown = () => {
        logger_1.logger.info('Shutting down server...');
        server.close(() => {
            logger_1.logger.info('Server closed');
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map