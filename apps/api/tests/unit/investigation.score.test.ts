import {
  HYPOTHESIS_SCHEMA_VERSION,
  summariseInvestigation,
  DEFAULT_STALE_AFTER_SECONDS,
  type HypothesisRecord,
} from '../../src/modules/hypotheses/investigation.score';

const at = (iso: string) => new Date(iso);

describe('investigation.score', () => {
  it('exports the schema version', () => {
    expect(HYPOTHESIS_SCHEMA_VERSION).toBe(1);
    expect(DEFAULT_STALE_AFTER_SECONDS).toBe(1800);
  });

  it('returns zeroed stats for empty input', () => {
    const s = summariseInvestigation([]);
    expect(s).toEqual({
      total: 0, confirmed: 0, refuted: 0, open: 0,
      hitRate: 0, meanTimeToFalsifySeconds: 0,
      meanHypothesesPerIncident: 0, openStale: 0,
    });
  });

  it('computes hit rate against settled (not open) hypotheses', () => {
    const records: HypothesisRecord[] = [
      { incidentId: 'i1', status: 'confirmed', createdAt: at('2026-01-01T00:00:00Z'), settledAt: at('2026-01-01T00:10:00Z') },
      { incidentId: 'i1', status: 'refuted',   createdAt: at('2026-01-01T00:00:00Z'), settledAt: at('2026-01-01T00:05:00Z') },
      { incidentId: 'i1', status: 'refuted',   createdAt: at('2026-01-01T00:00:00Z'), settledAt: at('2026-01-01T00:15:00Z') },
      { incidentId: 'i1', status: 'open',      createdAt: at('2026-01-01T00:00:00Z'), settledAt: null },
    ];
    const s = summariseInvestigation(records, { now: at('2026-01-01T00:20:00Z') });
    expect(s.total).toBe(4);
    expect(s.confirmed).toBe(1);
    expect(s.refuted).toBe(2);
    expect(s.open).toBe(1);
    expect(s.hitRate).toBeCloseTo(1 / 3, 5);
  });

  it('computes mean time to falsify across refuted only', () => {
    const records: HypothesisRecord[] = [
      { incidentId: 'i1', status: 'refuted', createdAt: at('2026-01-01T00:00:00Z'), settledAt: at('2026-01-01T00:02:00Z') }, // 120s
      { incidentId: 'i1', status: 'refuted', createdAt: at('2026-01-01T00:00:00Z'), settledAt: at('2026-01-01T00:08:00Z') }, // 480s
      { incidentId: 'i2', status: 'confirmed', createdAt: at('2026-01-01T00:00:00Z'), settledAt: at('2026-01-01T00:30:00Z') }, // ignored
    ];
    const s = summariseInvestigation(records);
    expect(s.meanTimeToFalsifySeconds).toBe(300);
  });

  it('counts stale opens by injected now and threshold', () => {
    const records: HypothesisRecord[] = [
      { incidentId: 'i1', status: 'open', createdAt: at('2026-01-01T00:00:00Z'), settledAt: null },
      { incidentId: 'i1', status: 'open', createdAt: at('2026-01-01T00:50:00Z'), settledAt: null },
    ];
    const s = summariseInvestigation(records, {
      now: at('2026-01-01T01:00:00Z'),
      staleAfterSeconds: 30 * 60,
    });
    expect(s.openStale).toBe(1);
  });

  it('reports mean hypotheses per incident', () => {
    const records: HypothesisRecord[] = [
      { incidentId: 'i1', status: 'open', createdAt: at('2026-01-01T00:00:00Z'), settledAt: null },
      { incidentId: 'i1', status: 'open', createdAt: at('2026-01-01T00:00:00Z'), settledAt: null },
      { incidentId: 'i2', status: 'open', createdAt: at('2026-01-01T00:00:00Z'), settledAt: null },
    ];
    const s = summariseInvestigation(records);
    expect(s.meanHypothesesPerIncident).toBeCloseTo(1.5, 5);
  });

  it('ignores invalid timestamps', () => {
    const records: HypothesisRecord[] = [
      { incidentId: 'i1', status: 'refuted', createdAt: at('2026-01-01T00:10:00Z'), settledAt: at('2026-01-01T00:00:00Z') }, // negative — ignored
    ];
    const s = summariseInvestigation(records);
    expect(s.meanTimeToFalsifySeconds).toBe(0);
  });
});
