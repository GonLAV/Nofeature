const mockRedis = { get: jest.fn(), setex: jest.fn(), del: jest.fn() };
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  redis: mockRedis,
  default: mockRedis,
}));

const mockMessagesCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

jest.mock('../../src/modules/incidents/incident.repository', () => ({
  IncidentRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
    updateAI: jest.fn(),
    getTimeline: jest.fn().mockResolvedValue([]),
  })),
}));

import { AIService } from '../../src/modules/ai/ai.service';
import { IncidentRepository } from '../../src/modules/incidents/incident.repository';

describe('AIService', () => {
  let svc: AIService;
  let repo: { findById: jest.Mock; updateAI: jest.Mock; getTimeline: jest.Mock };

  beforeEach(() => {
    mockMessagesCreate.mockReset();
    mockRedis.get.mockReset();
    mockRedis.setex.mockReset();
    svc = new AIService();
    repo = (IncidentRepository as unknown as jest.Mock).mock.results.slice(-1)[0].value;
  });

  describe('analyzeIncident', () => {
    it('returns undefined when incident not found', async () => {
      repo.findById.mockResolvedValue(null);
      const r = await svc.analyzeIncident('x', 't');
      expect(r).toBeUndefined();
    });

    it('returns cached value when present', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', description: 'd', severity: 'P1', status: 'open', created_at: new Date(), affected_systems: [] });
      mockRedis.get.mockResolvedValue(JSON.stringify({ rootCause: 'cached' }));
      const r = await svc.analyzeIncident('i', 't1');
      expect(r.rootCause).toBe('cached');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('calls Claude, persists results, and caches', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', description: 'd', severity: 'P1', status: 'open', created_at: new Date(), affected_systems: ['api'] });
      mockRedis.get.mockResolvedValue(null);
      mockMessagesCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            rootCause: 'db crashed',
            affectedSystems: ['api'],
            immediateActions: ['restart'],
            whoToPage: ['sre'],
            estimatedImpact: 'high',
            preventionSteps: ['monitoring'],
          }),
        }],
      });

      const r = await svc.analyzeIncident('i', 't1');
      expect(r.rootCause).toBe('db crashed');
      expect(repo.updateAI).toHaveBeenCalledWith('i', 't1', expect.objectContaining({ rootCause: 'db crashed' }));
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('rethrows when Claude API fails', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', description: 'd', severity: 'P1', status: 'open', created_at: new Date(), affected_systems: [] });
      mockRedis.get.mockResolvedValue(null);
      mockMessagesCreate.mockRejectedValue(new Error('rate limit'));
      await expect(svc.analyzeIncident('i', 't1')).rejects.toThrow('rate limit');
    });
  });

  describe('generatePostMortem', () => {
    it('throws when incident missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.generatePostMortem('x', 't')).rejects.toThrow(/not found/i);
    });

    it('returns markdown text from Claude', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', severity: 'P1', description: 'd', created_at: new Date(), resolved_at: new Date(), ai_root_cause: 'x' });
      mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: '# Post-mortem' }] });
      const r = await svc.generatePostMortem('i', 't');
      expect(r).toContain('Post-mortem');
    });

    it('returns empty string when content not text', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', severity: 'P1', description: 'd', created_at: new Date(), resolved_at: null, ai_root_cause: null });
      mockMessagesCreate.mockResolvedValue({ content: [{ type: 'tool_use' }] });
      const r = await svc.generatePostMortem('i', 't');
      expect(r).toBe('');
    });
  });

  describe('suggestResponders', () => {
    it('returns empty when incident missing', async () => {
      repo.findById.mockResolvedValue(null);
      expect(await svc.suggestResponders('x', 't')).toEqual([]);
    });

    it('returns parsed array on success', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', severity: 'P1', affected_systems: ['api'] });
      mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(['sre', 'be']) }] });
      const r = await svc.suggestResponders('i', 't');
      expect(r).toEqual(['sre', 'be']);
    });

    it('falls back to defaults on parse error', async () => {
      repo.findById.mockResolvedValue({ id: 'i', title: 't', severity: 'P1', affected_systems: [] });
      mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'not json at all' }] });
      const r = await svc.suggestResponders('i', 't');
      expect(r).toContain('backend-engineer');
    });
  });
});
