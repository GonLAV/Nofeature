const queryMock = jest.fn();
jest.mock('../../src/config/database', () => ({
  __esModule: true,
  default: { query: queryMock },
  db: { query: queryMock },
}));

import { IncidentRepository } from '../../src/modules/incidents/incident.repository';
import { UserRepository } from '../../src/modules/users/user.repository';

describe('IncidentRepository', () => {
  const repo = new IncidentRepository();
  beforeEach(() => queryMock.mockReset());

  it('findAll always filters by tenant_id and applies pagination', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'i1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const r = await repo.findAll('tenant-1', { status: 'open', severity: 'P1', limit: 5, offset: 0 });
    expect(r.total).toBe(1);
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('deleted_at IS NULL');
    expect(values[0]).toBe('tenant-1');
    expect(values).toContain('open');
    expect(values).toContain('P1');
  });

  it('findById filters by id, tenant, and excludes deleted', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'i1' }] });
    await repo.findById('i1', 't1');
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('i.id = $1');
    expect(sql).toContain('i.tenant_id = $2');
    expect(sql).toContain('deleted_at IS NULL');
    expect(values).toEqual(['i1', 't1']);
  });

  it('findById returns null when no row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await repo.findById('x', 't')).toBeNull();
  });

  it('create inserts with parameterized values', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'i1' }] });
    await repo.create({
      tenantId: 't1', title: 'x', description: 'y',
      severity: 'P3', createdBy: 'u1', affectedSystems: ['api'],
    });
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO incidents');
    expect(values).toContain('t1');
    expect(values).toContain('x');
  });

  it('updateStatus uses NOW() for resolved_at when status=resolved', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] });
    await repo.updateStatus('i', 't', 'resolved', 'u');
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('resolved_at = NOW()');
  });

  it('updateStatus sets resolved_at NULL otherwise', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] });
    await repo.updateStatus('i', 't', 'investigating', 'u');
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('resolved_at = NULL');
  });

  it('updateAI parameterizes JSON action items', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] });
    await repo.updateAI('i', 't', { rootCause: 'x', summary: 's', actionItems: { foo: 1 } });
    const [, values] = queryMock.mock.calls[0];
    expect(values[2]).toBe(JSON.stringify({ foo: 1 }));
  });

  it('assignCommander filters by tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] });
    await repo.assignCommander('i', 't', 'cmd');
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('tenant_id = $3');
    expect(values).toEqual(['cmd', 'i', 't']);
  });

  it('softDelete sets deleted_at = NOW() with tenant filter', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await repo.softDelete('i', 't');
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('deleted_at = NOW()');
    expect(sql).toContain('tenant_id = $2');
  });

  it('getTimeline filters by incident + tenant and orders ASC', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'e1' }] });
    await repo.getTimeline('i', 't');
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('ORDER BY t.created_at ASC');
    expect(sql).toContain('t.tenant_id = $2');
  });

  it('addTimelineEntry serializes metadata', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] });
    await repo.addTimelineEntry({
      incidentId: 'i', tenantId: 't', userId: 'u',
      action: 'X', metadata: { foo: 'bar' },
    });
    const [, values] = queryMock.mock.calls[0];
    expect(values[5]).toBe(JSON.stringify({ foo: 'bar' }));
  });
});

describe('UserRepository', () => {
  const repo = new UserRepository();
  beforeEach(() => queryMock.mockReset());

  it('findByEmail filters by deleted_at IS NULL', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u' }] });
    await repo.findByEmail('a@b.c');
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('findByEmail returns null when not found', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await repo.findByEmail('x@y.z')).toBeNull();
  });

  it('findById returns null when not found', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await repo.findById('u')).toBeNull();
  });

  it('findByTenant filters by tenant_id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u' }] });
    await repo.findByTenant('t1');
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('tenant_id = $1');
    expect(values).toEqual(['t1']);
  });

  it('create inserts hashed password', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u' }] });
    await repo.create({ tenantId: 't', email: 'a@b.c', passwordHash: 'h', name: 'n', role: 'member' });
    const [, values] = queryMock.mock.calls[0];
    expect(values).toContain('h');
    expect(values).toContain('member');
  });

  it('updateLastLogin parameterizes id and ip', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await repo.updateLastLogin('u', '1.2.3.4');
    const [, values] = queryMock.mock.calls[0];
    expect(values).toEqual(['u', '1.2.3.4']);
  });

  it('update returns null when no fields provided', async () => {
    const r = await repo.update('u', 't', {});
    expect(r).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('update builds dynamic SET clause', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u', name: 'X' }] });
    await repo.update('u', 't', { name: 'X', is_active: false });
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('name = $1');
    expect(sql).toContain('is_active = $2');
    expect(sql).toContain('tenant_id =');
  });

  it('softDelete filters by tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await repo.softDelete('u', 't');
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('deleted_at = NOW()');
    expect(values).toEqual(['u', 't']);
  });
});
