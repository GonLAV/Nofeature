/**
 * Verifies the logger automatically enriches log records with the
 * active request context. This is the "force multiplier" \u2014 any
 * existing `logger.info(...)` call inside a request now produces a
 * record carrying correlationId / userId / tenantId without the
 * caller knowing about it.
 */

import winston from 'winston';
import Transport from 'winston-transport';
import { logger } from '../../src/utils/logger';
import { runWithContext } from '../../src/utils/requestContext';

class CaptureTransport extends Transport {
  records: any[] = [];
  log(info: any, callback: () => void) {
    this.records.push(info);
    callback();
  }
}

describe('logger \u00d7 request context', () => {
  let capture: CaptureTransport;

  beforeAll(() => {
    capture = new CaptureTransport({ level: 'silly' });
    logger.add(capture);
  });
  afterAll(() => {
    logger.remove(capture);
  });
  beforeEach(() => { capture.records = []; });

  it('attaches correlationId/userId/tenantId/role from the active context', () => {
    runWithContext(
      {
        correlationId: 'corr-xyz',
        userId:        'u-1',
        tenantId:      't-9',
        role:          'admin',
        method:        'GET',
        route:         '/api/v1/incidents',
        startedAt:     Date.now(),
      },
      () => { logger.info('hello'); },
    );

    const rec = capture.records.find((r) => r.message === 'hello');
    expect(rec).toBeDefined();
    expect(rec.correlationId).toBe('corr-xyz');
    expect(rec.userId).toBe('u-1');
    expect(rec.tenantId).toBe('t-9');
    expect(rec.role).toBe('admin');
    expect(rec.route).toBe('/api/v1/incidents');
  });

  it('does not attach context fields when called outside a request', () => {
    logger.info('orphan');
    const rec = capture.records.find((r) => r.message === 'orphan');
    expect(rec).toBeDefined();
    expect(rec.correlationId).toBeUndefined();
    expect(rec.userId).toBeUndefined();
  });
});
