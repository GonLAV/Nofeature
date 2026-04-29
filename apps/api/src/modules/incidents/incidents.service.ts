import { IncidentRepository, IncidentSeverity, IncidentStatus, Incident } from '../../database/repositories/incidentRepository';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { JwtPayload } from '../../middleware/auth';

export interface CreateIncidentInput {
  title: string;
  description?: string;
  severity: IncidentSeverity;
}

export interface ListIncidentsQuery {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  page?: number;
  limit?: number;
}

export class IncidentsService {
  constructor(private readonly incidentRepo: IncidentRepository) {}

  async list(tenantId: string, query: ListIncidentsQuery) {
    return this.incidentRepo.list({
      tenantId,
      ...query,
      page: query.page ?? 1,
      limit: Math.min(query.limit ?? 20, 100),
    });
  }

  async create(input: CreateIncidentInput, user: JwtPayload): Promise<Incident> {
    const incident = await this.incidentRepo.create({
      tenantId: user.tenantId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      createdBy: user.sub,
    });

    await this.incidentRepo.addTimelineEvent({
      incidentId: incident.id,
      userId: user.sub,
      eventType: 'created',
      content: `Incident created with severity ${incident.severity}`,
    });

    return incident;
  }

  async getById(id: string, tenantId: string): Promise<Incident & { timeline: unknown[] }> {
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }
    const timeline = await this.incidentRepo.getTimeline(id);
    return { ...incident, timeline };
  }

  async updateStatus(id: string, status: IncidentStatus, user: JwtPayload): Promise<Incident> {
    const incident = await this.incidentRepo.updateStatus(id, user.tenantId, status);
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    await this.incidentRepo.addTimelineEvent({
      incidentId: id,
      userId: user.sub,
      eventType: 'status_change',
      content: `Status changed to ${status}`,
    });

    return incident;
  }

  async updateCommander(id: string, commanderId: string, user: JwtPayload): Promise<Incident> {
    const incident = await this.incidentRepo.updateCommander(id, user.tenantId, commanderId);
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    await this.incidentRepo.addTimelineEvent({
      incidentId: id,
      userId: user.sub,
      eventType: 'commander_assigned',
      content: `Commander assigned`,
    });

    return incident;
  }

  async getTimeline(id: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }
    return this.incidentRepo.getTimeline(id);
  }

  async delete(id: string, user: JwtPayload): Promise<void> {
    const incident = await this.incidentRepo.findById(id, user.tenantId);
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }
    if (incident.tenant_id !== user.tenantId) {
      throw new ForbiddenError();
    }
    await this.incidentRepo.delete(id, user.tenantId);
  }
}
