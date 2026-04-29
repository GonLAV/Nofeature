import db from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

export type Severity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  commander_id?: string;
  ai_root_cause?: string;
  ai_summary?: string;
  ai_action_items?: object;
  affected_systems: string[];
  created_by: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export class IncidentRepository {
  async findAll(tenantId: string, filters?: { status?: string; severity?: string; limit?: number; offset?: number }) {
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let i = 2;

    if (filters?.status)   { conditions.push(`status = $${i++}`);   values.push(filters.status); }
    if (filters?.severity) { conditions.push(`severity = $${i++}`); values.push(filters.severity); }

    const limit  = filters?.limit  ?? 20;
    const offset = filters?.offset ?? 0;
    values.push(limit, offset);

    const whereClause = conditions.join(' AND ');
    const { rows } = await db.query(
      `SELECT i.*, u.name as commander_name
       FROM incidents i
       LEFT JOIN users u ON i.commander_id = u.id
       WHERE ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      values
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM incidents WHERE ${whereClause}`,
      values.slice(0, -2)
    );

    return { incidents: rows, total: parseInt(count.rows[0].count, 10) };
  }

  async findById(id: string, tenantId: string): Promise<Incident | null> {
    const { rows } = await db.query(
      `SELECT i.*, u.name as commander_name, u.email as commander_email
       FROM incidents i
       LEFT JOIN users u ON i.commander_id = u.id
       WHERE i.id = $1 AND i.tenant_id = $2 AND i.deleted_at IS NULL`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  async create(data: {
    tenantId: string; title: string; description: string;
    severity: Severity; createdBy: string; affectedSystems?: string[];
  }): Promise<Incident> {
    const { rows } = await db.query(
      `INSERT INTO incidents (id, tenant_id, title, description, severity, status, created_by, affected_systems)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7) RETURNING *`,
      [uuidv4(), data.tenantId, data.title, data.description, data.severity, data.createdBy, data.affectedSystems ?? []]
    );
    return rows[0];
  }

  async updateStatus(id: string, tenantId: string, status: IncidentStatus, userId: string) {
    const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
    const { rows } = await db.query(
      `UPDATE incidents SET status = $1, resolved_at = ${resolvedAt}, updated_at = NOW(), updated_by = $4
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId, userId]
    );
    return rows[0];
  }

  async updateAI(id: string, tenantId: string, aiData: {
    rootCause?: string; summary?: string; actionItems?: object;
  }) {
    const { rows } = await db.query(
      `UPDATE incidents SET ai_root_cause = $1, ai_summary = $2, ai_action_items = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [aiData.rootCause, aiData.summary, JSON.stringify(aiData.actionItems), id, tenantId]
    );
    return rows[0];
  }

  async assignCommander(id: string, tenantId: string, commanderId: string) {
    const { rows } = await db.query(
      'UPDATE incidents SET commander_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [commanderId, id, tenantId]
    );
    return rows[0];
  }

  async softDelete(id: string, tenantId: string) {
    await db.query(
      'UPDATE incidents SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
  }

  async getTimeline(incidentId: string, tenantId: string) {
    const { rows } = await db.query(
      `SELECT t.*, u.name as user_name FROM incident_timeline t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.incident_id = $1 AND t.tenant_id = $2
       ORDER BY t.created_at ASC`,
      [incidentId, tenantId]
    );
    return rows;
  }

  async addTimelineEntry(data: {
    incidentId: string; tenantId: string; userId: string;
    action: string; metadata?: object;
  }) {
    const { rows } = await db.query(
      `INSERT INTO incident_timeline (id, incident_id, tenant_id, user_id, action, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), data.incidentId, data.tenantId, data.userId, data.action, JSON.stringify(data.metadata ?? {})]
    );
    return rows[0];
  }
}
