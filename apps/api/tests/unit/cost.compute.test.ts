import { computeCost, DEFAULT_COST_MODEL, CostInputs } from '../../src/modules/cost/cost.compute';

const baseInputs = (over: Partial<CostInputs> = {}): CostInputs => ({
  severity: 'P2',
  createdAt: new Date('2026-04-30T12:00:00Z'),
  resolvedAt: null,
  distinctResponders: 2,
  slaResolveMinutes: 240,
  revenuePerHourUsd: 600,
  now: new Date('2026-04-30T13:00:00Z'), // exactly 60 min later
  ...over,
});

describe('cost.compute', () => {
  describe('computeCost — open P2 at 60 min', () => {
    const out = computeCost(DEFAULT_COST_MODEL, baseInputs());

    it('reports elapsed minutes', () => {
      expect(out.elapsed_minutes).toBe(60);
    });

    it('charges responder hours at the configured rate', () => {
      // 2 responders * $120/h * 1h = 240
      expect(out.responder_cost).toBeCloseTo(240, 5);
    });

    it('charges customer impact at $600/h * 1h', () => {
      expect(out.customer_impact_cost).toBeCloseTo(600, 5);
    });

    it('charges P2 brand cost at $15/min * 60', () => {
      expect(out.brand_cost).toBeCloseTo(900, 5);
    });

    it('does NOT charge SLA breach yet (60 min < 240 min target)', () => {
      expect(out.sla_breach_cost).toBe(0);
      expect(out.inputs.sla_breached).toBe(false);
    });

    it('total = responder + customer + brand + sla', () => {
      expect(out.total).toBeCloseTo(240 + 600 + 900 + 0, 5);
    });

    it('reports a non-zero $/min burn rate while open', () => {
      // (2 * 120 / 60) + (600/60) + 15 = 4 + 10 + 15 = 29
      expect(out.burn_rate_per_min).toBeCloseTo(29, 5);
    });

    it('projects forward, including SLA breach if it would occur', () => {
      // +30 min: still 90 min total, no breach yet → +29*30 = +870
      expect(out.projection.plus_30_min).toBeCloseTo(out.total + 29 * 30, 5);
      // +60 min: 120 min total, still under 240 → no breach
      expect(out.projection.plus_60_min).toBeCloseTo(out.total + 29 * 60, 5);
    });
  });

  describe('SLA breach handling', () => {
    it('adds the flat fee once the resolve target is exceeded', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({
        now: new Date('2026-04-30T16:01:00Z'), // 241 min — 1 min past target
      }));
      expect(out.inputs.sla_breached).toBe(true);
      expect(out.sla_breach_cost).toBe(DEFAULT_COST_MODEL.slaBreachFlatUsd);
    });

    it('projection includes the flat fee when breach will occur within window', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({
        now: new Date('2026-04-30T15:30:00Z'), // 210 min — 30 min from breach
      }));
      // +60 projection should include breach (210+60 > 240)
      const expectedAddl = DEFAULT_COST_MODEL.slaBreachFlatUsd;
      const burnContribution = out.burn_rate_per_min * 60;
      expect(out.projection.plus_60_min).toBeCloseTo(out.total + burnContribution + expectedAddl, 1);
    });
  });

  describe('resolved incidents', () => {
    it('freezes the meter at resolved_at; no further burn', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({
        resolvedAt: new Date('2026-04-30T12:30:00Z'), // resolved at 30 min
        now:        new Date('2026-04-30T18:00:00Z'), // 6 hours later
      }));
      expect(out.elapsed_minutes).toBe(30);
      expect(out.burn_rate_per_min).toBe(0);
      expect(out.projection.plus_30_min).toBe(out.total);
      expect(out.projection.plus_60_min).toBe(out.total);
      expect(out.inputs.is_open).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('applies min_responders floor when no one is on the timeline yet', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({ distinctResponders: 0 }));
      // floor=1, $120/h * 1h
      expect(out.responders_billed).toBe(1);
      expect(out.responder_cost).toBeCloseTo(120, 5);
    });

    it('zero customer impact when none recorded', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({ revenuePerHourUsd: null }));
      expect(out.customer_impact_cost).toBe(0);
      expect(out.inputs.revenue_per_hour_usd).toBeNull();
    });

    it('handles unknown severity as zero brand cost (no crash)', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({ severity: 'P9' }));
      expect(out.brand_cost).toBe(0);
    });

    it('never returns negative totals', () => {
      const out = computeCost(DEFAULT_COST_MODEL, baseInputs({
        now: new Date('2026-04-30T11:00:00Z'), // before created_at
      }));
      expect(out.elapsed_minutes).toBe(0);
      expect(out.total).toBeGreaterThanOrEqual(0);
    });
  });
});
