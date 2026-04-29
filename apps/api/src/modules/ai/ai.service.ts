import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/env';
import { IncidentRepository } from '../incidents/incident.repository';
import { logger } from '../../utils/logger';
import { redis } from '../../config/redis';

const AI_CACHE_TTL = 3600; // 1 hour

export class AIService {
  private client: Anthropic;
  private incidentRepo: IncidentRepository;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.incidentRepo = new IncidentRepository();
  }

  async analyzeIncident(incidentId: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) return;

    const cacheKey = `ai:analysis:${incidentId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    logger.info('Starting AI analysis', { incidentId });

    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: `You are an expert SRE AI assistant specializing in incident response.
Analyze incidents and return ONLY valid JSON with this exact structure:
{
  "rootCause": "string - concise root cause analysis",
  "affectedSystems": ["array", "of", "systems"],
  "immediateActions": ["action 1", "action 2", "action 3"],
  "whoToPage": ["role1", "role2"],
  "estimatedImpact": "string",
  "preventionSteps": ["step 1", "step 2"],
  "severity_assessment": "string"
}`,
        messages: [{
          role: 'user',
          content: `Analyze this incident:
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}
Affected Systems: ${incident.affected_systems?.join(', ') || 'Unknown'}
Status: ${incident.status}
Created: ${incident.created_at}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      const analysis = JSON.parse(text);

      // Store AI results in DB
      await this.incidentRepo.updateAI(incidentId, tenantId, {
        rootCause: analysis.rootCause,
        summary: `Impact: ${analysis.estimatedImpact}. Root cause: ${analysis.rootCause}`,
        actionItems: {
          immediate: analysis.immediateActions,
          prevention: analysis.preventionSteps,
          whoToPage: analysis.whoToPage,
        },
      });

      // Cache the result
      await redis.setex(cacheKey, AI_CACHE_TTL, JSON.stringify(analysis));

      logger.info('AI analysis complete', { incidentId });
      return analysis;
    } catch (err) {
      logger.error('AI analysis error', { incidentId, error: (err as Error).message });
      throw err;
    }
  }

  async generatePostMortem(incidentId: string, tenantId: string): Promise<string> {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) throw new Error('Incident not found');

    const timeline = await this.incidentRepo.getTimeline(incidentId, tenantId);

    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 3000,
      system: 'You are an expert SRE writing a post-mortem report. Be concise, factual, and blameless.',
      messages: [{
        role: 'user',
        content: `Write a post-mortem for this incident:
Title: ${incident.title}
Severity: ${incident.severity}
Duration: ${incident.created_at} to ${incident.resolved_at || 'ongoing'}
Description: ${incident.description}
Root Cause (AI): ${incident.ai_root_cause || 'Not analyzed'}
Timeline: ${JSON.stringify(timeline.map(t => ({ action: t.action, time: t.created_at })))}

Format as markdown with sections: Summary, Impact, Timeline, Root Cause, Action Items, Prevention`,
      }],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  async suggestResponders(incidentId: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) return [];

    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 500,
      system: 'Return ONLY JSON array of role strings needed to respond to this incident.',
      messages: [{
        role: 'user',
        content: `Incident: ${incident.title}\nSeverity: ${incident.severity}\nSystems: ${incident.affected_systems?.join(', ')}`,
      }],
    });

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
      return JSON.parse(text);
    } catch {
      return ['backend-engineer', 'devops-engineer'];
    }
  }

  async chatAboutIncident(
    incidentId: string,
    tenantId: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string
  ): Promise<string> {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) throw new Error('Incident not found');
    const timeline = await this.incidentRepo.getTimeline(incidentId, tenantId);

    const systemPrompt = `You are an SRE incident-response assistant helping a war room.
Be concise, technical, and actionable. Cite the incident facts you have.

Current incident:
- Title: ${incident.title}
- Severity: ${incident.severity}
- Status: ${incident.status}
- Description: ${incident.description}
- Affected systems: ${incident.affected_systems?.join(', ') || 'unknown'}
- AI root cause (if any): ${incident.ai_root_cause || 'not analyzed yet'}
- AI summary: ${incident.ai_summary || 'n/a'}
- Created: ${incident.created_at}
- Resolved: ${incident.resolved_at || 'ongoing'}

Recent timeline:
${timeline.slice(0, 10).map((t) => `- ${t.created_at} ${t.action}`).join('\n') || '- (none yet)'}

If asked about logs/code/external systems you don't have, say so and suggest what to check.`;

    const trimmed = history.slice(-12);
    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [
        ...trimmed.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }
}
