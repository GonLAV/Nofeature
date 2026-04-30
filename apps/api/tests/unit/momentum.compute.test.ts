import { computeMomentum, MomentumInputs } from '../../src/modules/momentum/momentum.compute';

const baseInputs = (over: Partial<MomentumInputs> = {}): MomentumInputs => ({
  severity: 'P2',
  status: 'investigating',
  createdAt: new Date('2026-04-30T12:00:00Z'),
  resolvedAt: null,
  events5m: 6,
  events15m: 18,
  distinctContributors15m: 3,
  actionItemsCreated: 2,
  actionItemsCompleted: 1,
  hasProgressedFromOpen: true,
  lastEventAt: new Date('2026-04-30T12:14:30Z'), // 30s ago
  now: new Date('2026-04-30T12:15:00Z'),
  ...over,
});

describe('momentum.compute', () => {
  describe('healthy P2 war room', () => {
    const r = computeMomentum(baseInputs());

    it('produces a high score', () => {
      expect(r.score).toBeGreaterThanOrEqual(70);
    });

    it('categorizes as charging or steady', () => {
      expect(['charging', 'steady']).toContain(r.category);
    });

    it('does NOT flag as stalled', () => {
      expect(r.is_stalled).toBe(false);
    });

    it('exposes per-signal breakdown', () => {
      expect(r.signals.activity).toBeGreaterThan(0);
      expect(r.signals.diversity).toBeGreaterThan(0);
      expect(r.signals.convergence).toBeGreaterThan(0);
      expect(r.signals.freshness).toBeGreaterThan(0);
      expect(r.signals.activity_target_epm).toBe(1); // P2 target
    });
  });

  describe('frozen room — no events for 30 minutes', () => {
    const r = computeMomentum(baseInputs({
      events5m: 0,
      events15m: 0,
      distinctContributors15m: 0,
      lastEventAt: new Date('2026-04-30T11:45:00Z'), // 30m ago
    }));

    it('produces a low score', () => {
      expect(r.score).toBeLessThan(25);
    });

    it('classifies as frozen', () => {
      expect(r.category).toBe('frozen');
    });

    it('flags as stalled', () => {
      expect(r.is_stalled).toBe(true);
    });

    it('reason mentions paging IC / escalating', () => {
      expect(r.reason.toLowerCase()).toMatch(/escalat|page|ic/);
    });
  });

  describe('lone-wolf detection', () => {
    it('penalizes single-contributor rooms even with high activity', () => {
      const r = computeMomentum(baseInputs({
        events5m: 8, events15m: 24,
        distinctContributors15m: 1,
      }));
      expect(r.signals.diversity).toBeLessThanOrEqual(25);
    });
  });

  describe('severity sensitivity', () => {
    const lowActivity = { events5m: 1, events15m: 3, distinctContributors15m: 1 };

    it('P1 calls the same activity stalling that P4 calls steady', () => {
      const p1 = computeMomentum(baseInputs({ severity: 'P1', ...lowActivity, lastEventAt: new Date('2026-04-30T12:14:30Z') }));
      const p4 = computeMomentum(baseInputs({ severity: 'P4', ...lowActivity, lastEventAt: new Date('2026-04-30T12:14:30Z') }));
      expect(p4.score).toBeGreaterThan(p1.score);
    });
  });

  describe('resolved incidents', () => {
    it('pin to category=resolved with score 100 regardless of recent activity', () => {
      const r = computeMomentum(baseInputs({
        status: 'resolved',
        resolvedAt: new Date('2026-04-30T12:10:00Z'),
        events5m: 0, events15m: 0, distinctContributors15m: 0,
        lastEventAt: null,
      }));
      expect(r.category).toBe('resolved');
      expect(r.score).toBe(100);
      expect(r.is_stalled).toBe(false);
    });
  });

  describe('freshness decay', () => {
    it('drops as time-since-last-event grows', () => {
      const recent = computeMomentum(baseInputs({
        lastEventAt: new Date('2026-04-30T12:14:00Z'), // 1 min ago
      }));
      const old = computeMomentum(baseInputs({
        lastEventAt: new Date('2026-04-30T12:00:30Z'), // 14.5 min ago
      }));
      expect(recent.signals.freshness).toBeGreaterThan(old.signals.freshness);
    });
  });

  describe('convergence', () => {
    it('rewards completed action items', () => {
      const noAi = computeMomentum(baseInputs({ actionItemsCreated: 0, actionItemsCompleted: 0 }));
      const withAi = computeMomentum(baseInputs({ actionItemsCreated: 5, actionItemsCompleted: 3 }));
      expect(withAi.signals.convergence).toBeGreaterThan(noAi.signals.convergence);
    });

    it('penalizes stuck-on-open status', () => {
      const open = computeMomentum(baseInputs({ status: 'open', hasProgressedFromOpen: false }));
      const moved = computeMomentum(baseInputs({ status: 'investigating', hasProgressedFromOpen: true }));
      expect(moved.signals.convergence).toBeGreaterThan(open.signals.convergence);
    });
  });

  describe('edge cases', () => {
    it('handles brand-new incident with no events yet', () => {
      const r = computeMomentum(baseInputs({
        events5m: 0, events15m: 0, distinctContributors15m: 0,
        actionItemsCreated: 0, actionItemsCompleted: 0,
        hasProgressedFromOpen: false,
        lastEventAt: null,
        status: 'open',
        now: new Date('2026-04-30T12:00:30Z'), // 30s into the incident
      }));
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.is_stalled).toBe(false); // <5 min cool-off
    });

    it('returns a valid category for unknown severity', () => {
      const r = computeMomentum(baseInputs({ severity: 'P9' }));
      expect(['charging', 'steady', 'stalling', 'frozen']).toContain(r.category);
    });
  });
});
