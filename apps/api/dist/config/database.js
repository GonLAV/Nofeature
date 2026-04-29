"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.connectDatabase = connectDatabase;
const pg_1 = require("pg");
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
exports.pool.on('error', (err) => {
    logger_1.logger.error('Unexpected error on idle client', err);
});
async function connectDatabase() {
    const client = await exports.pool.connect();
    client.release();
    logger_1.logger.info('Database connected successfully');
}
//# sourceMappingURL=database.js.map