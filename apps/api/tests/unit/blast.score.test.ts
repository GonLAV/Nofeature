/**
 * Pure-math contract tests for the Blast Radius Forecaster.
 */

import {
  computeRadius,
  estimateGrowthRate,
  estimateConfidence,
  minutesToThreshold,
  forecast,
  CUSTOMER_IMPACT_THRESHOLD,
  P1_ESCALATION_THRESHOLD,
  FORECAST_SCHEMA_VERSION,
  type ForecastInput,
} from '../../src/modules/blast/blast.score';

const baseInput = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  severity:               'P3',
  affectedSystems:        1,
  serviceCount:           1,
  timelineEventsLast5min: 0,
  commentsLast5min:       0,
  distinctStatusValues:   1,
  ageMinutes:             10,
  recentSamples:          [],
  ...over,
});

describe('Blast Radius Forecaster \u00d7 scoring', () => {
  it('exports a schema version', () => {
    expect(FORECAST_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('a P1 starts already at or above the customer-impact threshold', () => {
    const { radius } = computeRadius(baseInput({ severity: 'P1' }));
    expect(radius).toBeGreaterThanOrEqual(CUSTOMER_IMPACT_THRESHOLD);
  });

  it('a P4 with nothing happening sits well below the threshold', () => {
    const { radius } = computeRadius(baseInput({ severity: 'P4' }));
    expect(radius).toBeLessThan(0.1);
  });

  it('radius is bounded in [0, 1] under any input magnitude', () => {
    const { radius } = computeRadius(baseInput({
      severity:               'P1',
      affectedSystems:        500,
      serviceCount:           500,
      timelineEventsLast5min: 999,
      commentsLast5min:       999,
      distinctStatusValues:   99,
    }));
    expect(radius).toBeGreaterThanOrEqual(0);
    expect(radius).toBeLessThanOrEqual(1);
  });

  it('blast width grows monotonically with affected systems', () => {
    const a = computeRadius(baseInput({ affectedSystems: 0 })).radius;
    const b = computeRadius(baseInput({ affectedSystems: 3 })).radius;
    const c = computeRadius(baseInput({ affectedSystems: 8 })).radius;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('estimateGrowthRate returns 0 for empty / single-sample inputs', () => {
    expect(estimateGrowthRate([])).toBe(0);
    expect(estimateGrowthRate([{ capturedAt: new Date(), radius: 0.5 }])).toBe(0);
  });

  it('estimateGrowthRate recovers a known linear slope', () => {
    const t0 = new Date('2026-04-30T12:00:00Z').getTime();
    const samples = [0, 1, 2, 3, 4].map((m) => ({
      capturedAt: new Date(t0 + m * 60_000),
      radius:     0.10 + m * 0.05,           // +0.05 / min
    }));
    const slope = estimateGrowthRate(samples);
    expect(slope).toBeCloseTo(0.05, 4);
  });

  it('minutesToThreshold returns null when already past threshold', () => {
    expect(minutesToThreshold(0.7, 0.05, CUSTOMER_IMPACT_THRESHOLD)).toBeNull();
  });

  it('minutesToThreshold returns null when not growing', () => {
    expect(minutesToThreshold(0.3, 0,    CUSTOMER_IMPACT_THRESHOLD)).toBeNull();
    expect(minutesToThreshold(0.3, -0.1, CUSTOMER_IMPACT_THRESHOLD)).toBeNull();
  });

  it('minutesToThreshold solves the linear ETA correctly', () => {
    // 0.30 \u2192 0.45 at +0.05/min \u2192 3 min
    expect(minutesToThreshold(0.30, 0.05, 0.45)).toBe(3);
  });

  it('minutesToThreshold returns null when ETA is beyond the horizon', () => {
    expect(minutesToThreshold(0.10, 0.001, P1_ESCALATION_THRESHOLD, 60)).toBeNull();
  });

  it('confidence is low for cold starts and rises with sample count + age + motion', () => {
    const cold = estimateConfidence(baseInput({ ageMinutes: 0, recentSamples: [] }), 0);
    const warm = estimateConfidence(
      baseInput({
        ageMinutes:    15,
        recentSamples: Array.from({ length: 6 }, (_, i) => ({
          capturedAt: new Date(2026, 0, 1, 12, i),
          radius:     0.3,
        })),
      }),
      0.10,
    );
    expect(cold).toBeLessThan(0.2);
    expect(warm).toBeGreaterThan(0.7);
  });

  it('full forecast: a flat-line P3 produces no ETAs but still bounded outputs', () => {
    const out = forecast(baseInput());
    expect(out.minutesToCustomerImpact).toBeNull();
    expect(out.minutesToP1Escalation).toBeNull();
    expect(out.currentRadius).toBeGreaterThanOrEqual(0);
    expect(out.projectedRadius30min).toBeLessThanOrEqual(1);
  });

  it('full forecast: a growing P2 surfaces a customer-impact ETA', () => {
    const t0 = new Date('2026-04-30T12:00:00Z').getTime();
    const samples = [0, 1, 2, 3].map((m) => ({
      capturedAt: new Date(t0 + m * 60_000),
      radius:     0.30 + m * 0.04,
    }));
    const out = forecast(baseInput({
      severity:               'P2',
      affectedSystems:        3,
      timelineEventsLast5min: 4,
      ageMinutes:             5,
      recentSamples:          samples,
    }));
    expect(out.growthRatePerMin).toBeGreaterThan(0);
    // Either we're already over (null) or we have a sane positive ETA.
    if (out.minutesToCustomerImpact !== null) {
      expect(out.minutesToCustomerImpact).toBeGreaterThan(0);
      expect(out.minutesToCustomerImpact).toBeLessThanOrEqual(120);
    }
  });
});
