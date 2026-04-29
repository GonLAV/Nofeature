"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentsService = void 0;
const errors_1 = require("../../utils/errors");
class IncidentsService {
    constructor(incidentRepo) {
        this.incidentRepo = incidentRepo;
    }
    async list(tenantId, query) {
        return this.incidentRepo.list({
            tenantId,
            ...query,
            page: query.page ?? 1,
            limit: Math.min(query.limit ?? 20, 100),
        });
    }
    async create(input, user) {
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
    async getById(id, tenantId) {
        const incident = await this.incidentRepo.findById(id, tenantId);
        if (!incident) {
            throw new errors_1.NotFoundError('Incident not found');
        }
        const timeline = await this.incidentRepo.getTimeline(id);
        return { ...incident, timeline };
    }
    async updateStatus(id, status, user) {
        const incident = await this.incidentRepo.updateStatus(id, user.tenantId, status);
        if (!incident) {
            throw new errors_1.NotFoundError('Incident not found');
        }
        await this.incidentRepo.addTimelineEvent({
            incidentId: id,
            userId: user.sub,
            eventType: 'status_change',
            content: `Status changed to ${status}`,
        });
        return incident;
    }
    async updateCommander(id, commanderId, user) {
        const incident = await this.incidentRepo.updateCommander(id, user.tenantId, commanderId);
        if (!incident) {
            throw new errors_1.NotFoundError('Incident not found');
        }
        await this.incidentRepo.addTimelineEvent({
            incidentId: id,
            userId: user.sub,
            eventType: 'commander_assigned',
            content: `Commander assigned`,
        });
        return incident;
    }
    async getTimeline(id, tenantId) {
        const incident = await this.incidentRepo.findById(id, tenantId);
        if (!incident) {
            throw new errors_1.NotFoundError('Incident not found');
        }
        return this.incidentRepo.getTimeline(id);
    }
    async delete(id, user) {
        const incident = await this.incidentRepo.findById(id, user.tenantId);
        if (!incident) {
            throw new errors_1.NotFoundError('Incident not found');
        }
        if (incident.tenant_id !== user.tenantId) {
            throw new errors_1.ForbiddenError();
        }
        await this.incidentRepo.delete(id, user.tenantId);
    }
}
exports.IncidentsService = IncidentsService;
//# sourceMappingURL=incidents.service.js.map