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
export declare class IncidentRepository {
    private readonly db;
    constructor(db: Pool);
    findById(id: string, tenantId: string): Promise<Incident | null>;
    list(options: ListIncidentsOptions): Promise<{
        incidents: Incident[];
        total: number;
    }>;
    create(data: {
        tenantId: string;
        title: string;
        description?: string;
        severity: IncidentSeverity;
        createdBy: string;
    }): Promise<Incident>;
    updateStatus(id: string, tenantId: string, status: IncidentStatus): Promise<Incident | null>;
    updateCommander(id: string, tenantId: string, commanderId: string): Promise<Incident | null>;
    delete(id: string, tenantId: string): Promise<boolean>;
    getTimeline(incidentId: string): Promise<TimelineEvent[]>;
    addTimelineEvent(data: {
        incidentId: string;
        userId?: string;
        eventType: string;
        content: string;
    }): Promise<TimelineEvent>;
    findAiAnalysis(incidentId: string, analysisType: AiAnalysis['analysis_type'], withinMinutes?: number): Promise<AiAnalysis | null>;
    saveAiAnalysis(data: {
        incidentId: string;
        analysisType: AiAnalysis['analysis_type'];
        content: Record<string, unknown>;
    }): Promise<AiAnalysis>;
}
//# sourceMappingURL=incidentRepository.d.ts.map