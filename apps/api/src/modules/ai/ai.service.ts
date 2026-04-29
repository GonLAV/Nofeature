import Anthropic from '@anthropic-ai/sdk';
import { IncidentRepository, Incident } from '../../database/repositories/incidentRepository';
import { env } from '../../config/env';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class AiService {
  private readonly anthropic: Anthropic;

  constructor(private readonly incidentRepo: IncidentRepository) {
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async analyzeRootCause(incidentId: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) throw new NotFoundError('Incident not found');

    const cached = await this.incidentRepo.findAiAnalysis(incidentId, 'root_cause', 60);
    if (cached) return { cached: true, data: cached };

    const timeline = await this.incidentRepo.getTimeline(incidentId);
    const prompt = this.buildRootCausePrompt(incident, timeline);

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    const text = content.type === 'text' ? content.text : '';

    const analysis = await this.incidentRepo.saveAiAnalysis({
      incidentId,
      analysisType: 'root_cause',
      content: { analysis: text, model: 'claude-3-5-haiku-20241022', tokens: message.usage },
    });

    await this.notifySlackIfHighSeverity(incident, 'Root cause analysis completed');
    return { cached: false, data: analysis };
  }

  async generatePostmortem(incidentId: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) throw new NotFoundError('Incident not found');

    const cached = await this.incidentRepo.findAiAnalysis(incidentId, 'postmortem', 60);
    if (cached) return { cached: true, data: cached };

    const timeline = await this.incidentRepo.getTimeline(incidentId);
    const prompt = this.buildPostmortemPrompt(incident, timeline);

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    const text = content.type === 'text' ? content.text : '';

    const analysis = await this.incidentRepo.saveAiAnalysis({
      incidentId,
      analysisType: 'postmortem',
      content: { markdown: text, model: 'claude-3-5-haiku-20241022', tokens: message.usage },
    });

    return { cached: false, data: analysis };
  }

  async suggestResponders(incidentId: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) throw new NotFoundError('Incident not found');

    const cached = await this.incidentRepo.findAiAnalysis(incidentId, 'responders', 60);
    if (cached) return { cached: true, data: cached };

    const prompt = this.buildRespondersPrompt(incident);

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    const text = content.type === 'text' ? content.text : '';

    const analysis = await this.incidentRepo.saveAiAnalysis({
      incidentId,
      analysisType: 'responders',
      content: { suggestions: text, model: 'claude-3-5-haiku-20241022', tokens: message.usage },
    });

    return { cached: false, data: analysis };
  }

  private buildRootCausePrompt(incident: Incident, timeline: unknown[]): string {
    return `You are an SRE expert. Analyze the following incident and provide a detailed root cause analysis.

Incident: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}
Description: ${incident.description ?? 'No description provided'}
Timeline Events: ${JSON.stringify(timeline, null, 2)}

Provide a structured root cause analysis including:
1. Immediate cause
2. Contributing factors
3. Root cause
4. Recommendations to prevent recurrence`;
  }

  private buildPostmortemPrompt(incident: Incident, timeline: unknown[]): string {
    return `You are an SRE expert. Generate a detailed postmortem document in Markdown format for the following incident.

Incident: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}
Created: ${incident.created_at}
Resolved: ${incident.resolved_at ?? 'Not yet resolved'}
Description: ${incident.description ?? 'No description provided'}
Timeline: ${JSON.stringify(timeline, null, 2)}

Generate a comprehensive postmortem with sections: Summary, Impact, Timeline, Root Cause, Resolution, Action Items.`;
  }

  private buildRespondersPrompt(incident: Incident): string {
    return `You are an incident management expert. Based on the following incident, suggest the types of responders that should be involved.

Incident: ${incident.title}
Severity: ${incident.severity}
Description: ${incident.description ?? 'No description provided'}

Suggest specific team roles and expertise needed to respond to this incident. Format as a JSON array of objects with fields: role, reason, priority (high/medium/low).`;
  }

  private async notifySlackIfHighSeverity(incident: Incident, message: string): Promise<void> {
    if (!env.SLACK_BOT_TOKEN || !['P1', 'P2'].includes(incident.severity)) return;

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          channel: '#incidents',
          text: `🚨 [${incident.severity}] ${incident.title}: ${message}`,
        }),
      });
      if (!response.ok) {
        logger.warn('Slack notification failed:', response.statusText);
      }
    } catch (err) {
      logger.warn('Failed to send Slack notification:', err);
    }
  }

  async notifyNewIncident(incident: Incident): Promise<void> {
    if (!env.SLACK_BOT_TOKEN || !['P1', 'P2'].includes(incident.severity)) return;

    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          channel: '#incidents',
          text: `🚨 New ${incident.severity} Incident: *${incident.title}*\nStatus: ${incident.status}\nDescription: ${incident.description ?? 'N/A'}`,
        }),
      });
    } catch (err) {
      logger.warn('Failed to send Slack notification:', err);
    }
  }
}
