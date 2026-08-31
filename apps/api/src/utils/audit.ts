import db from '../config/database';
import { logger } from './logger';

interface AuditParams {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(p: AuditParams): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, resource, resource_id, ip_address, user_agent, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        p.tenantId ?? null,
        p.userId   ?? null,
        p.action,
        p.resource   ?? null,
        p.resourceId ?? null,
        p.ipAddress  ?? null,
        p.userAgent  ?? null,
        JSON.stringify(p.metadata ?? {}),
      ],
    );
  } catch (err) {
    // Audit failures must never break the primary request path
    logger.error('Audit write failed', { action: p.action, error: (err as Error).message });
  }
}
