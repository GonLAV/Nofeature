import { NotificationService } from '../../src/modules/notifications/notification.service';

describe('NotificationService', () => {
  const svc = new NotificationService();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('notifyNewIncident posts to Slack with correct payload', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test'; // value used by config snapshot
    // Re-require config to pick up token? config is cached; instead patch directly.
    const cfg = require('../../src/config/env').config;
    cfg.slack.botToken = 'xoxb-test';
    cfg.slack.defaultChannel = '#incidents';

    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as never;

    await svc.notifyNewIncident({
      id: 'inc-1', title: 'API down', severity: 'P1', description: 'everything is broken',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.channel).toBe('#incidents');
    expect(body.text).toContain('P1');
  });

  it('notifyNewIncident skips when no token configured', async () => {
    const cfg = require('../../src/config/env').config;
    cfg.slack.botToken = undefined;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    await svc.notifyNewIncident({ id: 'i', title: 't', severity: 'P1', description: 'd' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notifyNewIncident swallows fetch errors (never throws)', async () => {
    const cfg = require('../../src/config/env').config;
    cfg.slack.botToken = 'xoxb-test';
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    await expect(
      svc.notifyNewIncident({ id: 'i', title: 't', severity: 'P2', description: 'd' })
    ).resolves.toBeUndefined();
  });

  it('notifyResolved posts to Slack', async () => {
    const cfg = require('../../src/config/env').config;
    cfg.slack.botToken = 'xoxb-test';
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    global.fetch = fetchMock as never;
    await svc.notifyResolved({ id: 'i', title: 't', severity: 'P1' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('notifyResolved skips when no token', async () => {
    const cfg = require('../../src/config/env').config;
    cfg.slack.botToken = undefined;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    await svc.notifyResolved({ id: 'i', title: 't', severity: 'P1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notifyResolved swallows errors', async () => {
    const cfg = require('../../src/config/env').config;
    cfg.slack.botToken = 'xoxb-test';
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as never;
    await expect(svc.notifyResolved({ id: 'i', title: 't', severity: 'P1' })).resolves.toBeUndefined();
  });
});
