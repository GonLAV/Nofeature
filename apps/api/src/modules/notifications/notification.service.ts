import { config } from '../../config/env';
import { logger } from '../../utils/logger';

export class NotificationService {
  async notifyNewIncident(incident: { id: string; title: string; severity: string; description: string }) {
    if (!config.slack.botToken) {
      logger.warn('Slack not configured, skipping notification');
      return;
    }

    const severityEmoji: Record<string, string> = { P1: '🔴', P2: '🟠', P3: '🟡', P4: '🔵' };
    const emoji = severityEmoji[incident.severity] || '⚪';

    const message = {
      channel: config.slack.defaultChannel!,
      text: `${emoji} *New ${incident.severity} Incident: ${incident.title}*`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} ${incident.severity} Incident: ${incident.title}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: incident.description.substring(0, 300) },
        },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'Open War Room' },
            style: 'danger',
            url: `${config.corsOrigin}/incidents/${incident.id}`,
          }],
        },
      ],
    };

    try {
      const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.slack.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!data.ok) logger.error('Slack error', { error: data.error });
      else logger.info('Slack notified', { incidentId: incident.id });
    } catch (err) {
      logger.error('Slack notification failed', { error: (err as Error).message });
    }
  }

  async notifyResolved(incident: { id: string; title: string; severity: string }) {
    if (!config.slack.botToken) return;

    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.slack.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: config.slack.defaultChannel,
          text: `✅ *RESOLVED* ${incident.severity} - ${incident.title}`,
        }),
      });
    } catch (err) {
      logger.error('Slack resolved notification failed', { error: (err as Error).message });
    }
  }
}
