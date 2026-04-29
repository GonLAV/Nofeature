import db from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id: string;
  incident_id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: Date;
}

export class WarRoomRepository {
  async saveMessage(data: {
    incidentId: string;
    tenantId: string;
    userId: string;
    content: string;
  }): Promise<ChatMessage> {
    const { rows } = await db.query<ChatMessage>(
      `INSERT INTO incident_messages (id, incident_id, tenant_id, user_id, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id, incident_id, tenant_id, user_id, content, created_at`,
      [uuidv4(), data.incidentId, data.tenantId, data.userId, data.content],
    );
    return rows[0];
  }

  async getMessages(
    incidentId: string,
    tenantId: string,
    limit = 100,
  ): Promise<ChatMessage[]> {
    const { rows } = await db.query<ChatMessage>(
      `SELECT m.*, u.name AS user_name
       FROM incident_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.incident_id = $1 AND m.tenant_id = $2
       ORDER BY m.created_at ASC
       LIMIT $3`,
      [incidentId, tenantId, limit],
    );
    return rows;
  }
}
