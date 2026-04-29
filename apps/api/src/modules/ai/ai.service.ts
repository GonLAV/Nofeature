import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { config } from '../../config/env';
import { IncidentRepository } from '../incidents/incident.repository';
import { publish } from '../warroom/warroom.events';
import { logger } from '../../utils/logger';
import { redis } from '../../config/redis';

const AI_CACHE_TTL = 3600; // 1 hour

// Reusable system prompt block — eligible for prompt caching on repeated calls
const ANALYSIS_SYSTEM: Anthropic.TextBlockParam & { cache_control?: { type: 'ephemeral' } } = {
  type: 'text',
  text: `You are an expert SRE AI assistant specializing in incident response.
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
  cache_control: { type: 'ephemeral' },
};

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
        model: 'claude-opus-4-7',
        max_tokens: 2000,
        system: [ANALYSIS_SYSTEM] as Anthropic.TextBlockParam[],
        messages: [{ role: 'user', content: this.buildIncidentPrompt(incident) }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      const analysis = JSON.parse(text);

      await this.incidentRepo.updateAI(incidentId, tenantId, {
        rootCause: analysis.rootCause,
        summary: `Impact: ${analysis.estimatedImpact}. Root cause: ${analysis.rootCause}`,
        actionItems: {
          immediate: analysis.immediateActions,
          prevention: analysis.preventionSteps,
          whoToPage: analysis.whoToPage,
        },
      });

      await redis.setex(cacheKey, AI_CACHE_TTL, JSON.stringify(analysis));

      // Notify all war room subscribers that AI analysis is ready
      publish(incidentId, { type: 'ai_complete', payload: analysis });

      logger.info('AI analysis complete', { incidentId });
      return analysis;
    } catch (err) {
      logger.error('AI analysis error', { incidentId, error: (err as Error).message });
      throw err;
    }
  }

  // Streams analysis tokens directly to the SSE response AND broadcasts to war room channel
  async streamAnalysis(incidentId: string, tenantId: string, res: Response): Promise<void> {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) {
      res.write(`data: ${JSON.stringify({ type: 'error', text: 'Incident not found' })}\n\n`);
      res.end();
      return;
    }

    // Invalidate cache so fresh analysis is stored after streaming
    await redis.del(`ai:analysis:${incidentId}`);

    logger.info('Starting streaming AI analysis', { incidentId });

    try {
      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: [ANALYSIS_SYSTEM] as Anthropic.TextBlockParam[],
        messages: [{ role: 'user', content: this.buildIncidentPrompt(incident) }],
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          const token = chunk.delta.text;

          // Push to the requesting client directly
          res.write(`data: ${JSON.stringify({ type: 'ai_token', text: token })}\n\n`);

          // Broadcast to all other war room participants
          publish(incidentId, { type: 'ai_token', payload: { text: token } });
        }
      }

      const finalMsg = await stream.finalMessage();
      const text =
        finalMsg.content[0].type === 'text' ? finalMsg.content[0].text : '{}';

      let analysis: Record<string, unknown> = {};
      try {
        analysis = JSON.parse(text);
      } catch {
        logger.warn('AI streamed non-JSON response', { incidentId });
      }

      // Persist results if we got valid JSON
      if (analysis.rootCause) {
        await this.incidentRepo.updateAI(incidentId, tenantId, {
          rootCause: analysis.rootCause as string,
          summary: `Impact: ${analysis.estimatedImpact}. Root cause: ${analysis.rootCause}`,
          actionItems: {
            immediate: analysis.immediateActions,
            prevention: analysis.preventionSteps,
            whoToPage: analysis.whoToPage,
          },
        });
        await redis.setex(
          `ai:analysis:${incidentId}`,
          AI_CACHE_TTL,
          JSON.stringify(analysis),
        );
      }

      res.write(`data: ${JSON.stringify({ type: 'ai_complete', payload: analysis })}\n\n`);
      publish(incidentId, { type: 'ai_complete', payload: analysis });

      logger.info('Streaming AI analysis complete', { incidentId });
    } catch (err) {
      const msg = (err as Error).message;
      logger.error('Streaming AI error', { incidentId, error: msg });
      res.write(`data: ${JSON.stringify({ type: 'error', text: msg })}\n\n`);
    } finally {
      res.end();
    }
  }

  async generatePostMortem(incidentId: string, tenantId: string): Promise<string> {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) throw new Error('Incident not found');

    const timeline = await this.incidentRepo.getTimeline(incidentId, tenantId);

    const response = await this.client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4000,
      system: 'You are an expert SRE writing a post-mortem report. Be concise, factual, and blameless.',
      messages: [
        {
          role: 'user',
          content: `Write a post-mortem for this incident:
Title: ${incident.title}
Severity: ${incident.severity}
Duration: ${incident.created_at} to ${incident.resolved_at || 'ongoing'}
Description: ${incident.description}
Root Cause (AI): ${incident.ai_root_cause || 'Not analyzed'}
Timeline: ${JSON.stringify(timeline.map(t => ({ action: t.action, time: t.created_at })))}

Format as markdown with sections: Summary, Impact, Timeline, Root Cause, Action Items, Prevention`,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  async suggestResponders(incidentId: string, tenantId: string) {
    const incident = await this.incidentRepo.findById(incidentId, tenantId);
    if (!incident) return [];

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: 'Return ONLY JSON array of role strings needed to respond to this incident.',
      messages: [
        {
          role: 'user',
          content: `Incident: ${incident.title}\nSeverity: ${incident.severity}\nSystems: ${incident.affected_systems?.join(', ')}`,
        },
      ],
    });

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
      return JSON.parse(text);
    } catch {
      return ['backend-engineer', 'devops-engineer'];
    }
  }

  private buildIncidentPrompt(incident: {
    title: string;
    description: string;
    severity: string;
    affected_systems?: string[];
    status: string;
    created_at: Date;
  }): string {
    return `Analyze this incident:
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}
Affected Systems: ${incident.affected_systems?.join(', ') || 'Unknown'}
Status: ${incident.status}
Created: ${incident.created_at}`;
  }
}
