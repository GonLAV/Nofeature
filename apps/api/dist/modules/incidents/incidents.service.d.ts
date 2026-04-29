import { IncidentRepository, IncidentSeverity, IncidentStatus, Incident } from '../../database/repositories/incidentRepository';
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
export declare class IncidentsService {
    private readonly incidentRepo;
    constructor(incidentRepo: IncidentRepository);
    list(tenantId: string, query: ListIncidentsQuery): Promise<{
        incidents: Incident[];
        total: number;
    }>;
    create(input: CreateIncidentInput, user: JwtPayload): Promise<Incident>;
    getById(id: string, tenantId: string): Promise<Incident & {
        timeline: unknown[];
    }>;
    updateStatus(id: string, status: IncidentStatus, user: JwtPayload): Promise<Incident>;
    updateCommander(id: string, commanderId: string, user: JwtPayload): Promise<Incident>;
    getTimeline(id: string, tenantId: string): Promise<import("../../database/repositories/incidentRepository").TimelineEvent[]>;
    delete(id: string, user: JwtPayload): Promise<void>;
}
//# sourceMappingURL=incidents.service.d.ts.map