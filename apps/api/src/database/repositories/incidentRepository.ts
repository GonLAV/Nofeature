import { Pool } from 'pg';

export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'open' | 'investigating' | 'mitigating' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  commander_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

export interface TimelineEvent {
  id: string;
  incident_id: string;
  user_id: string | null;
  event_type: string;
  content: string;
  created_at: Date;
}

export interface AiAnalysis {
  id: string;
  incident_id: string;
  analysis_type: 'root_cause' | 'postmortem' | 'responders';
  content: Record<string, unknown>;
  created_at: Date;
}

export interface ListIncidentsOptions {
  tenantId: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  page?: number;
  limit?: number;
}

export class IncidentRepository {
  constructor(private readonly db: Pool) {}

  async findById(id: string, tenantId: string): Promise<Incident | null> {
    const result = await this.db.query<Incident>(
      'SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows[0] ?? null;
  }

  async list(options: ListIncidentsOptions): Promise<{ incidents: Incident[]; total: number }> {
    const { tenantId, status, severity, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    const params: unknown[] = [tenantId];
    const conditions: string[] = ['tenant_id = $1'];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      conditions.push(`severity = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM incidents WHERE ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await this.db.query<Incident>(
      `SELECT * FROM incidents WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { incidents: result.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async create(data: {
    tenantId: string;
    title: string;
    description?: string;
    severity: IncidentSeverity;
    createdBy: string;
  }): Promise<Incident> {
    const result = await this.db.query<Incident>(
      `INSERT INTO incidents (tenant_id, title, description, severity, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.tenantId, data.title, data.description ?? null, data.severity, data.createdBy]
    );
    return result.rows[0];
  }

  async updateStatus(id: string, tenantId: string, status: IncidentStatus): Promise<Incident | null> {
    const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
    const result = await this.db.query<Incident>(
      `UPDATE incidents SET status = $1, resolved_at = ${resolvedAt} WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId]
    );
    return result.rows[0] ?? null;
  }

  async updateCommander(id: string, tenantId: string, commanderId: string): Promise<Incident | null> {
    const result = await this.db.query<Incident>(
      'UPDATE incidents SET commander_id = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [commanderId, id, tenantId]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM incidents WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getTimeline(incidentId: string): Promise<TimelineEvent[]> {
    const result = await this.db.query<TimelineEvent>(
      'SELECT * FROM timeline_events WHERE incident_id = $1 ORDER BY created_at ASC',
      [incidentId]
    );
    return result.rows;
  }

  async addTimelineEvent(data: {
    incidentId: string;
    userId?: string;
    eventType: string;
    content: string;
  }): Promise<TimelineEvent> {
    const result = await this.db.query<TimelineEvent>(
      'INSERT INTO timeline_events (incident_id, user_id, event_type, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.incidentId, data.userId ?? null, data.eventType, data.content]
    );
    return result.rows[0];
  }

  async findAiAnalysis(
    incidentId: string,
    analysisType: AiAnalysis['analysis_type'],
    withinMinutes = 60
  ): Promise<AiAnalysis | null> {
    const result = await this.db.query<AiAnalysis>(
      `SELECT * FROM ai_analyses
       WHERE incident_id = $1 AND analysis_type = $2
         AND created_at > NOW() - INTERVAL '${withinMinutes} minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [incidentId, analysisType]
    );
    return result.rows[0] ?? null;
  }

  async saveAiAnalysis(data: {
    incidentId: string;
    analysisType: AiAnalysis['analysis_type'];
    content: Record<string, unknown>;
  }): Promise<AiAnalysis> {
    const result = await this.db.query<AiAnalysis>(
      'INSERT INTO ai_analyses (incident_id, analysis_type, content) VALUES ($1, $2, $3) RETURNING *',
      [data.incidentId, data.analysisType, JSON.stringify(data.content)]
    );
    return result.rows[0];
  }
}
