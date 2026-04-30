import {
  PROMISE_SCHEMA_VERSION,
  TRUST_FLOOR,
  TRUST_HALF_LIFE_DAYS,
  ENDANGERED_OVERDUE_DAYS,
  recencyWeight,
  trustScore,
  overdueDays,
  summarise,
  type PromiseRecord,
} from '../../src/modules/promises/promise.score';

const day = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-04-30T12:00:00Z');

const make = (over: Partial<PromiseRecord> = {}): PromiseRecord => ({
  status:     'open',
  resolvedAt: null,
  dueDate:    new Date(NOW.getTime() - 1 * day),
  ...over,
});

describe('promise.score', () => {
  it('exposes a stable schema version', () => {
    expect(PROMISE_SCHEMA_VERSION).toBe(1);
  });

  describe('recencyWeight', () => {
    it('is 1 at age zero', () => {
      expect(recencyWeight(0)).toBe(1);
    });
    it('is 0.5 at exactly one half-life', () => {
      expect(recencyWeight(TRUST_HALF_LIFE_DAYS)).toBeCloseTo(0.5, 6);
    });
    it('decays monotonically', () => {
      const a = recencyWeight(10);
      const b = recencyWeight(20);
      const c = recencyWeight(40);
      expect(a).toBeGreaterThan(b);
      expect(b).toBeGreaterThan(c);
    });
    it('handles negative ages gracefully', () => {
      expect(recencyWeight(-5)).toBe(1);
    });
  });

  describe('trustScore', () => {
    it('returns neutral 0.5 with no resolved promises', () => {
      expect(trustScore([])).toBe(0.5);
      expect(trustScore([make({ status: 'open' })])).toBe(0.5);
    });

    it('is 1 when every resolved promise was kept', () => {
      const records = [
        make({ status: 'kept',   resolvedAt: new Date(NOW.getTime() - 5 * day) }),
        make({ status: 'kept',   resolvedAt: new Date(NOW.getTime() - 30 * day) }),
      ];
      expect(trustScore(records, NOW)).toBe(1);
    });

    it('is 0 when every resolved promise was broken', () => {
      const records = [
        make({ status: 'broken', resolvedAt: new Date(NOW.getTime() - 1 * day) }),
        make({ status: 'broken', resolvedAt: new Date(NOW.getTime() - 200 * day) }),
      ];
      expect(trustScore(records, NOW)).toBe(0);
    });

    it('penalises recent broken promises more than old ones', () => {
      const recentBreak = [
        make({ status: 'kept',   resolvedAt: new Date(NOW.getTime() - 200 * day) }),
        make({ status: 'broken', resolvedAt: new Date(NOW.getTime() - 1 * day) }),
      ];
      const oldBreak = [
        make({ status: 'kept',   resolvedAt: new Date(NOW.getTime() - 1 * day) }),
        make({ status: 'broken', resolvedAt: new Date(NOW.getTime() - 200 * day) }),
      ];
      expect(trustScore(recentBreak, NOW)).toBeLessThan(trustScore(oldBreak, NOW));
    });

    it('ignores cancelled and open promises', () => {
      const records = [
        make({ status: 'kept',      resolvedAt: new Date(NOW.getTime() - 1 * day) }),
        make({ status: 'cancelled' }),
        make({ status: 'open' }),
      ];
      expect(trustScore(records, NOW)).toBe(1);
    });
  });

  describe('overdueDays', () => {
    it('is 0 for promises not yet due', () => {
      const future = make({ dueDate: new Date(NOW.getTime() + 5 * day) });
      expect(overdueDays(future, NOW)).toBe(0);
    });
    it('counts days past the due date for open promises', () => {
      const overdue = make({ dueDate: new Date(NOW.getTime() - 3 * day) });
      expect(overdueDays(overdue, NOW)).toBeCloseTo(3, 5);
    });
    it('returns 0 for resolved promises regardless of due date', () => {
      const resolved = make({
        status: 'broken',
        resolvedAt: new Date(NOW.getTime() - 1 * day),
        dueDate:    new Date(NOW.getTime() - 100 * day),
      });
      expect(overdueDays(resolved, NOW)).toBe(0);
    });
  });

  describe('summarise', () => {
    it('counts buckets, flags low trust, marks endangered open promises', () => {
      const records: PromiseRecord[] = [
        make({ status: 'kept',   resolvedAt: new Date(NOW.getTime() - 1 * day) }),
        make({ status: 'broken', resolvedAt: new Date(NOW.getTime() - 1 * day) }),
        make({ status: 'broken', resolvedAt: new Date(NOW.getTime() - 1 * day) }),
        make({ status: 'open',   dueDate: new Date(NOW.getTime() - (ENDANGERED_OVERDUE_DAYS + 1) * day) }),
        make({ status: 'open',   dueDate: new Date(NOW.getTime() + 5 * day) }),
        make({ status: 'cancelled' }),
      ];
      const s = summarise(records, NOW);
      expect(s.total).toBe(6);
      expect(s.kept).toBe(1);
      expect(s.broken).toBe(2);
      expect(s.open).toBe(2);
      expect(s.cancelled).toBe(1);
      expect(s.overdue).toBe(1);
      expect(s.endangered).toBe(1);
      expect(s.trust).toBeLessThan(TRUST_FLOOR);
      expect(s.flagged).toBe(true);
    });

    it('does not flag tenants with no resolution history', () => {
      const records: PromiseRecord[] = [make({ status: 'open' })];
      const s = summarise(records, NOW);
      expect(s.flagged).toBe(false);
      expect(s.trust).toBe(0.5);
    });
  });
});
