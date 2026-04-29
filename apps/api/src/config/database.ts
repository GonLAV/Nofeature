import { Pool, PoolClient } from 'pg';
import { config } from './env';
import { logger } from '../utils/logger';

const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.poolMin,
  max: config.database.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: config.isProduction ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New DB connection established');
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),

  getClient: async (): Promise<PoolClient> => pool.connect(),

  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  healthCheck: async (): Promise<boolean> => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },
};

export default db;
