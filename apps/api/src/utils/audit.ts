import type { PoolClient } from 'pg';
import db from '../config/database';
import { logger } from './logger';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

type Executor = Pick<PoolClient, 'query'> | typeof db;

/**
 * Records an audit log entry.
 *
 * - Uses the provided client (when inside a transaction) or the shared pool.
 * - Never throws: audit failures are logged but do not break the request.
 * - Schema column is `resource` (NOT `resource_type`), with `resource_id` and JSONB `metadata`.
 */
export async function writeAudit(executor: Executor | null | undefined, entry: AuditEntry): Promise<void> {
  const exec = executor ?? db;
  try {
    await exec.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.tenantId,
        entry.userId ?? null,
        entry.action,
        entry.resource,
        entry.resourceId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ip ?? null,
      ]
    );
  } catch (err) {
    logger.error('audit.write_failed', {
      error: err instanceof Error ? err.message : String(err),
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      tenantId: entry.tenantId,
    });
  }
}

export default writeAudit;
