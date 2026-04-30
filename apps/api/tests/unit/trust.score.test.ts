import {
  scorePulse,
  blendBaseline,
  TRUST_SCHEMA_VERSION,
  TRUST_LOSS_FLOOR,
  FALLBACK_BASELINE,
  type Audience,
  type Severity,
} from '../../src/modules/trust/trust.score';

describe('Trust Decay scoring', () => {
  it('exports a schema version', () => {
    expect(TRUST_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('returns full trust when on cadence', () => {
    const out = scorePulse({ audience: 'customers', severity: 'P1', gapMinutes: 5, baselineMinutes: 8 });
    expect(out.trustScore).toBe(1);
    expect(out.minutesToTrustLoss).toBeGreaterThan(0);
  });

  it('decays trust when overrun is significant', () => {
    const out = scorePulse({ audience: 'customers', severity: 'P1', gapMinutes: 24, baselineMinutes: 8 });
    expect(out.trustScore).toBeLessThan(1);
    expect(out.trustScore).toBeGreaterThanOrEqual(0);
  });

  it('reports collapse (null ETA) once trust is at or below the floor', () => {
    const out = scorePulse({ audience: 'customers', severity: 'P1', gapMinutes: 240, baselineMinutes: 8 });
    expect(out.trustScore).toBeLessThanOrEqual(TRUST_LOSS_FLOOR);
    expect(out.minutesToTrustLoss).toBeNull();
  });

  it('customers lose trust faster than internal at same gap', () => {
    const cust  = scorePulse({ audience: 'customers', severity: 'P2', gapMinutes: 30, baselineMinutes: 15 });
    const intnl = scorePulse({ audience: 'internal',  severity: 'P2', gapMinutes: 30, baselineMinutes: 15 });
    expect(cust.trustScore).toBeLessThan(intnl.trustScore);
  });

  it('higher severity decays trust faster at the same overrun', () => {
    const p1 = scorePulse({ audience: 'exec', severity: 'P1', gapMinutes: 20, baselineMinutes: 10 });
    const p3 = scorePulse({ audience: 'exec', severity: 'P3', gapMinutes: 20, baselineMinutes: 10 });
    expect(p1.trustScore).toBeLessThan(p3.trustScore);
  });

  it('trust score is bounded in [0, 1]', () => {
    const extreme = scorePulse({ audience: 'customers', severity: 'P1', gapMinutes: 9999, baselineMinutes: 1 });
    expect(extreme.trustScore).toBeGreaterThanOrEqual(0);
    expect(extreme.trustScore).toBeLessThanOrEqual(1);
  });

  it('blendBaseline returns the fallback when there is no history', () => {
    (['customers','internal','exec'] as Audience[]).forEach((a) => {
      (['P1','P2','P3','P4'] as Severity[]).forEach((s) => {
        expect(blendBaseline(a, s, [])).toBe(FALLBACK_BASELINE[a][s]);
      });
    });
  });

  it('blendBaseline pulls toward the sample mean as samples accumulate', () => {
    const fallback = FALLBACK_BASELINE.customers.P1; // 8
    const blended  = blendBaseline('customers', 'P1', Array.from({ length: 20 }, () => 4));
    // 20 samples should overpower the prior weight=3.
    expect(blended).toBeLessThan(fallback);
    expect(blended).toBeGreaterThan(4);  // still nudged up by the prior
  });

  it('minutesToTrustLoss is null when ETA is far beyond the horizon', () => {
    const out = scorePulse({
      audience: 'internal', severity: 'P4',
      gapMinutes: 0.1, baselineMinutes: 1000,
    });
    expect(out.minutesToTrustLoss).toBeNull();
  });
});
