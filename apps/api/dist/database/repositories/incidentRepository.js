"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentRepository = void 0;
class IncidentRepository {
    constructor(db) {
        this.db = db;
    }
    async findById(id, tenantId) {
        const result = await this.db.query('SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return result.rows[0] ?? null;
    }
    async list(options) {
        const { tenantId, status, severity, page = 1, limit = 20 } = options;
        const offset = (page - 1) * limit;
        const params = [tenantId];
        const conditions = ['tenant_id = $1'];
        if (status) {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }
        if (severity) {
            params.push(severity);
            conditions.push(`severity = $${params.length}`);
        }
        const where = conditions.join(' AND ');
        const countResult = await this.db.query(`SELECT COUNT(*) FROM incidents WHERE ${where}`, params);
        params.push(limit, offset);
        const result = await this.db.query(`SELECT * FROM incidents WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        return { incidents: result.rows, total: parseInt(countResult.rows[0].count, 10) };
    }
    async create(data) {
        const result = await this.db.query(`INSERT INTO incidents (tenant_id, title, description, severity, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [data.tenantId, data.title, data.description ?? null, data.severity, data.createdBy]);
        return result.rows[0];
    }
    async updateStatus(id, tenantId, status) {
        const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
        const result = await this.db.query(`UPDATE incidents SET status = $1, resolved_at = ${resolvedAt} WHERE id = $2 AND tenant_id = $3 RETURNING *`, [status, id, tenantId]);
        return result.rows[0] ?? null;
    }
    async updateCommander(id, tenantId, commanderId) {
        const result = await this.db.query('UPDATE incidents SET commander_id = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *', [commanderId, id, tenantId]);
        return result.rows[0] ?? null;
    }
    async delete(id, tenantId) {
        const result = await this.db.query('DELETE FROM incidents WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return (result.rowCount ?? 0) > 0;
    }
    async getTimeline(incidentId) {
        const result = await this.db.query('SELECT * FROM timeline_events WHERE incident_id = $1 ORDER BY created_at ASC', [incidentId]);
        return result.rows;
    }
    async addTimelineEvent(data) {
        const result = await this.db.query('INSERT INTO timeline_events (incident_id, user_id, event_type, content) VALUES ($1, $2, $3, $4) RETURNING *', [data.incidentId, data.userId ?? null, data.eventType, data.content]);
        return result.rows[0];
    }
    async findAiAnalysis(incidentId, analysisType, withinMinutes = 60) {
        const result = await this.db.query(`SELECT * FROM ai_analyses
       WHERE incident_id = $1 AND analysis_type = $2
         AND created_at > NOW() - INTERVAL '${withinMinutes} minutes'
       ORDER BY created_at DESC LIMIT 1`, [incidentId, analysisType]);
        return result.rows[0] ?? null;
    }
    async saveAiAnalysis(data) {
        const result = await this.db.query('INSERT INTO ai_analyses (incident_id, analysis_type, content) VALUES ($1, $2, $3) RETURNING *', [data.incidentId, data.analysisType, JSON.stringify(data.content)]);
        return result.rows[0];
    }
}
exports.IncidentRepository = IncidentRepository;
//# sourceMappingURL=incidentRepository.js.map