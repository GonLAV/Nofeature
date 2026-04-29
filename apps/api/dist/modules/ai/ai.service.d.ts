import { IncidentRepository, Incident } from '../../database/repositories/incidentRepository';
export declare class AiService {
    private readonly incidentRepo;
    private readonly anthropic;
    constructor(incidentRepo: IncidentRepository);
    analyzeRootCause(incidentId: string, tenantId: string): Promise<{
        cached: boolean;
        data: import("../../database/repositories/incidentRepository").AiAnalysis;
    }>;
    generatePostmortem(incidentId: string, tenantId: string): Promise<{
        cached: boolean;
        data: import("../../database/repositories/incidentRepository").AiAnalysis;
    }>;
    suggestResponders(incidentId: string, tenantId: string): Promise<{
        cached: boolean;
        data: import("../../database/repositories/incidentRepository").AiAnalysis;
    }>;
    private buildRootCausePrompt;
    private buildPostmortemPrompt;
    private buildRespondersPrompt;
    private notifySlackIfHighSeverity;
    notifyNewIncident(incident: Incident): Promise<void>;
}
//# sourceMappingURL=ai.service.d.ts.map