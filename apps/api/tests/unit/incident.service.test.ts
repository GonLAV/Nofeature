import { IncidentService } from '../../src/modules/incidents/incident.service';

const makeRepo = () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  updateAI: jest.fn(),
  assignCommander: jest.fn(),
  softDelete: jest.fn(),
  getTimeline: jest.fn(),
  addTimelineEntry: jest.fn(),
});

const makeAi = () => ({ analyzeIncident: jest.fn().mockResolvedValue({}) });
const makeNotif = () => ({
  notifyNewIncident: jest.fn().mockResolvedValue(undefined),
  notifyResolved: jest.fn().mockResolvedValue(undefined),
});

describe('IncidentService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let ai: ReturnType<typeof makeAi>;
  let notif: ReturnType<typeof makeNotif>;
  let svc: IncidentService;

  beforeEach(() => {
    repo = makeRepo();
    ai = makeAi();
    notif = makeNotif();
    svc = new IncidentService(repo as never, ai as never, notif as never);
  });

  describe('createIncident', () => {
    it('creates, adds timeline, triggers AI analysis (fire-and-forget)', async () => {
      repo.create.mockResolvedValue({ id: 'inc-1', tenant_id: 't1' });
      const result = await svc.createIncident({
        title: 'x', description: 'y', severity: 'P3',
        tenantId: 't1', userId: 'u1',
      });
      expect(result.id).toBe('inc-1');
      expect(repo.addTimelineEntry).toHaveBeenCalled();
      // AI is fire-and-forget — promise resolved separately
      await new Promise((r) => setImmediate(r));
      expect(ai.analyzeIncident).toHaveBeenCalledWith('inc-1', 't1');
      expect(notif.notifyNewIncident).not.toHaveBeenCalled(); // P3 → no Slack
    });

    it('notifies Slack on P1 severity', async () => {
      repo.create.mockResolvedValue({ id: 'inc-2', tenant_id: 't1' });
      await svc.createIncident({
        title: 'x', description: 'y', severity: 'P1',
        tenantId: 't1', userId: 'u1',
      });
      expect(notif.notifyNewIncident).toHaveBeenCalled();
    });

    it('does not crash if AI throws', async () => {
      repo.create.mockResolvedValue({ id: 'inc-3', tenant_id: 't1' });
      ai.analyzeIncident.mockRejectedValue(new Error('claude is down'));
      await expect(
        svc.createIncident({ title: 'x', description: 'y', severity: 'P4', tenantId: 't1', userId: 'u1' })
      ).resolves.toBeDefined();
    });
  });

  describe('updateStatus', () => {
    it('throws NotFound when incident missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.updateStatus('inc', 't1', 'resolved', 'u1')).rejects.toThrow(/not found/i);
    });

    it('updates and notifies on resolved', async () => {
      repo.findById.mockResolvedValue({ id: 'inc', status: 'open' });
      repo.updateStatus.mockResolvedValue({ id: 'inc', status: 'resolved' });
      const r = await svc.updateStatus('inc', 't1', 'resolved', 'u1');
      expect(r.status).toBe('resolved');
      expect(notif.notifyResolved).toHaveBeenCalled();
      expect(repo.addTimelineEntry).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATUS_CHANGED' })
      );
    });

    it('does not call notifyResolved on non-resolved transitions', async () => {
      repo.findById.mockResolvedValue({ id: 'inc', status: 'open' });
      repo.updateStatus.mockResolvedValue({ id: 'inc', status: 'investigating' });
      await svc.updateStatus('inc', 't1', 'investigating', 'u1');
      expect(notif.notifyResolved).not.toHaveBeenCalled();
    });
  });

  describe('assignCommander', () => {
    it('throws NotFound when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.assignCommander('inc', 't1', 'cmd', 'u1')).rejects.toThrow(/not found/i);
    });

    it('assigns and adds timeline', async () => {
      repo.findById.mockResolvedValue({ id: 'inc' });
      repo.assignCommander.mockResolvedValue({ id: 'inc', commander_id: 'cmd' });
      const r = await svc.assignCommander('inc', 't1', 'cmd', 'u1');
      expect(r.commander_id).toBe('cmd');
      expect(repo.addTimelineEntry).toHaveBeenCalled();
    });
  });

  describe('deleteIncident', () => {
    it('forbids non-admin roles', async () => {
      await expect(svc.deleteIncident('i', 't', 'u', 'member')).rejects.toThrow(/admin/i);
    });

    it('throws NotFound when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.deleteIncident('i', 't', 'u', 'admin')).rejects.toThrow(/not found/i);
    });

    it('soft-deletes when admin', async () => {
      repo.findById.mockResolvedValue({ id: 'i' });
      await svc.deleteIncident('i', 't', 'u', 'admin');
      expect(repo.softDelete).toHaveBeenCalledWith('i', 't');
    });
  });

  describe('listIncidents / getIncident / getTimeline', () => {
    it('listIncidents passes pagination', async () => {
      repo.findAll.mockResolvedValue({ incidents: [], total: 0 });
      await svc.listIncidents('t', { page: 2, limit: 10 });
      expect(repo.findAll).toHaveBeenCalledWith('t', expect.objectContaining({ limit: 10, offset: 10 }));
    });

    it('getIncident returns incident + timeline', async () => {
      repo.findById.mockResolvedValue({ id: 'i' });
      repo.getTimeline.mockResolvedValue([{ id: 't1' }]);
      const r = await svc.getIncident('i', 't');
      expect(r.timeline).toHaveLength(1);
    });

    it('getIncident throws when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getIncident('i', 't')).rejects.toThrow();
    });

    it('getTimeline throws when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getTimeline('i', 't')).rejects.toThrow();
    });
  });
});
