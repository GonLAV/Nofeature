import { IncidentsService } from '../../src/modules/incidents/incidents.service';
import { IncidentRepository } from '../../src/database/repositories/incidentRepository';
import { NotFoundError } from '../../src/utils/errors';
import { JwtPayload } from '../../src/middleware/auth';

const mockIncidentRepo = {
  list: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  updateCommander: jest.fn(),
  getTimeline: jest.fn(),
  addTimelineEvent: jest.fn(),
  delete: jest.fn(),
} as unknown as IncidentRepository;

const incidentsService = new IncidentsService(mockIncidentRepo);

const mockUser: JwtPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'admin',
  tenantId: 'tenant-1',
};

const mockIncident = {
  id: 'incident-1',
  tenant_id: 'tenant-1',
  title: 'Database is down',
  description: 'Primary DB is unresponsive',
  severity: 'P1' as const,
  status: 'open' as const,
  commander_id: null,
  created_by: 'user-1',
  created_at: new Date(),
  updated_at: new Date(),
  resolved_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IncidentsService.list', () => {
  it('should return paginated incidents', async () => {
    const expected = { incidents: [mockIncident], total: 1 };
    (mockIncidentRepo.list as jest.Mock).mockResolvedValue(expected);

    const result = await incidentsService.list('tenant-1', { page: 1, limit: 20 });

    expect(result).toEqual(expected);
    expect(mockIncidentRepo.list).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      page: 1,
      limit: 20,
    });
  });

  it('should cap limit at 100', async () => {
    (mockIncidentRepo.list as jest.Mock).mockResolvedValue({ incidents: [], total: 0 });

    await incidentsService.list('tenant-1', { limit: 999 });

    expect(mockIncidentRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });
});

describe('IncidentsService.create', () => {
  it('should create an incident and add timeline event', async () => {
    (mockIncidentRepo.create as jest.Mock).mockResolvedValue(mockIncident);
    (mockIncidentRepo.addTimelineEvent as jest.Mock).mockResolvedValue({});

    const result = await incidentsService.create(
      { title: 'Database is down', severity: 'P1' },
      mockUser
    );

    expect(result).toEqual(mockIncident);
    expect(mockIncidentRepo.addTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'created' })
    );
  });
});

describe('IncidentsService.getById', () => {
  it('should return incident with timeline', async () => {
    const timeline = [{ id: 'ev-1', event_type: 'created', content: 'Incident created' }];
    (mockIncidentRepo.findById as jest.Mock).mockResolvedValue(mockIncident);
    (mockIncidentRepo.getTimeline as jest.Mock).mockResolvedValue(timeline);

    const result = await incidentsService.getById('incident-1', 'tenant-1');

    expect(result).toMatchObject({ ...mockIncident, timeline });
  });

  it('should throw NotFoundError if incident does not exist', async () => {
    (mockIncidentRepo.findById as jest.Mock).mockResolvedValue(null);

    await expect(incidentsService.getById('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundError);
  });
});

describe('IncidentsService.updateStatus', () => {
  it('should update status and add timeline event', async () => {
    const updated = { ...mockIncident, status: 'investigating' as const };
    (mockIncidentRepo.updateStatus as jest.Mock).mockResolvedValue(updated);
    (mockIncidentRepo.addTimelineEvent as jest.Mock).mockResolvedValue({});

    const result = await incidentsService.updateStatus('incident-1', 'investigating', mockUser);

    expect(result.status).toBe('investigating');
    expect(mockIncidentRepo.addTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'status_change' })
    );
  });

  it('should throw NotFoundError if incident not found', async () => {
    (mockIncidentRepo.updateStatus as jest.Mock).mockResolvedValue(null);

    await expect(
      incidentsService.updateStatus('nonexistent', 'investigating', mockUser)
    ).rejects.toThrow(NotFoundError);
  });
});
