import { IncidentRepository, Severity, IncidentStatus } from './incident.repository';
import { AIService } from '../ai/ai.service';
import { NotificationService } from '../notifications/notification.service';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class IncidentService {
  constructor(
    private incidentRepo: IncidentRepository,
    private aiService: AIService,
    private notificationService: NotificationService,
  ) {}

  async listIncidents(tenantId: string, filters?: { status?: string; severity?: string; page?: number; limit?: number }) {
    const limit  = filters?.limit ?? 20;
    const offset = ((filters?.page ?? 1) - 1) * limit;
    return this.incidentRepo.findAll(tenantId, { ...filters, limit, offset });
  }

  async getIncident(id: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) throw new NotFoundError('Incident');
    const timeline = await this.incidentRepo.getTimeline(id, tenantId);
    return { ...incident, timeline };
  }

  async createIncident(data: {
    title: string; description: string; severity: Severity;
    tenantId: string; userId: string; affectedSystems?: string[];
  }) {
    const incident = await this.incidentRepo.create({
      tenantId: data.tenantId,
      title: data.title,
      description: data.description,
      severity: data.severity,
      createdBy: data.userId,
      affectedSystems: data.affectedSystems,
    });

    await this.incidentRepo.addTimelineEntry({
      incidentId: incident.id,
      tenantId: data.tenantId,
      userId: data.userId,
      action: 'INCIDENT_CREATED',
      metadata: { severity: data.severity },
    });

    // Notify immediately for P1/P2
    if (['P1', 'P2'].includes(data.severity)) {
      await this.notificationService.notifyNewIncident(incident).catch((e) =>
        logger.error('Notification failed', { error: e.message })
      );
    }

    // Trigger AI analysis async (don't block response)
    this.aiService.analyzeIncident(incident.id, data.tenantId).catch((e) =>
      logger.error('AI analysis failed', { incidentId: incident.id, error: e.message })
    );

    logger.info('Incident created', { incidentId: incident.id, severity: data.severity });
    return incident;
  }

  async updateStatus(id: string, tenantId: string, status: IncidentStatus, userId: string) {
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) throw new NotFoundError('Incident');

    const updated = await this.incidentRepo.updateStatus(id, tenantId, status, userId);

    await this.incidentRepo.addTimelineEntry({
      incidentId: id, tenantId, userId,
      action: 'STATUS_CHANGED',
      metadata: { from: incident.status, to: status },
    });

    if (status === 'resolved') {
      await this.notificationService.notifyResolved(updated).catch(() => {});
    }

    return updated;
  }

  async assignCommander(id: string, tenantId: string, commanderId: string, requesterId: string) {
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) throw new NotFoundError('Incident');

    const updated = await this.incidentRepo.assignCommander(id, tenantId, commanderId);

    await this.incidentRepo.addTimelineEntry({
      incidentId: id, tenantId, userId: requesterId,
      action: 'COMMANDER_ASSIGNED',
      metadata: { commanderId },
    });

    return updated;
  }

  async getTimeline(id: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) throw new NotFoundError('Incident');
    return this.incidentRepo.getTimeline(id, tenantId);
  }

  async deleteIncident(id: string, tenantId: string, userId: string, role: string) {
    if (!['admin', 'owner'].includes(role)) throw new ForbiddenError('Only admins can delete incidents');
    const incident = await this.incidentRepo.findById(id, tenantId);
    if (!incident) throw new NotFoundError('Incident');
    await this.incidentRepo.softDelete(id, tenantId);
    await this.incidentRepo.addTimelineEntry({ incidentId: id, tenantId, userId, action: 'INCIDENT_DELETED' });
    logger.warn('Incident deleted', { incidentId: id, deletedBy: userId });
  }
}
