/**
 * Pure-math contract tests for the cognitive-load scorer.
 */

import {
  computeLoad,
  bandFor,
  pickFreshestResponder,
  LOAD_SCHEMA_VERSION,
} from '../../src/modules/load/load.score';

const empty = () => ({
  activeIncidentSeverities: [] as ('P1' | 'P2' | 'P3' | 'P4')[],
  commentsLastHour:         0,
  oncallMinutesToday:       0,
  minutesSinceLastBreak:    0,
  weeklyOncallMinutes:      0,
});

describe('Responder cognitive load \u00d7 scoring', () => {
  it('exports a schema version', () => {
    expect(LOAD_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('idle responder scores 0 and bands as "idle"', () => {
    const { score, breakdown } = computeLoad(empty());
    expect(score).toBe(0);
    expect(breakdown.band).toBe('idle');
    expect(breakdown.severityCounts).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 });
  });

  it('score is bounded in [0, 1) regardless of input magnitude', () => {
    const { score } = computeLoad({
      activeIncidentSeverities: Array(50).fill('P1'),
      commentsLastHour:         10_000,
      oncallMinutesToday:       60_000,
      minutesSinceLastBreak:    100_000,
      weeklyOncallMinutes:      999_999,
    });
    expect(score).toBeGreaterThan(0.99);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('severity bucketing: a P1 outweighs many P4s', () => {
    const onlyP1 = computeLoad({ ...empty(), activeIncidentSeverities: ['P1'] }).score;
    const fourP4 = computeLoad({
      ...empty(),
      activeIncidentSeverities: ['P4', 'P4', 'P4', 'P4'],
    }).score;
    expect(onlyP1).toBeGreaterThan(fourP4);
  });

  it('monotonicity: adding pressure never decreases the score', () => {
    const a = computeLoad(empty()).score;
    const b = computeLoad({ ...empty(), commentsLastHour: 10 }).score;
    const c = computeLoad({ ...empty(), commentsLastHour: 10, oncallMinutesToday: 120 }).score;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('break threshold: short breaks are free, long ones hurt', () => {
    const fresh = computeLoad({ ...empty(), minutesSinceLastBreak: 30 }).score;
    const tired = computeLoad({ ...empty(), minutesSinceLastBreak: 300 }).score;
    expect(fresh).toBe(0);          // below 90-min threshold
    expect(tired).toBeGreaterThan(0.5);
  });

  it('weekly fatigue: under 30hr/week is free, beyond it accumulates', () => {
    const healthy  = computeLoad({ ...empty(), weeklyOncallMinutes: 25 * 60 }).score;
    const punished = computeLoad({ ...empty(), weeklyOncallMinutes: 70 * 60 }).score;
    expect(healthy).toBe(0);
    expect(punished).toBeGreaterThan(0.5);
  });

  it('handles negative / NaN inputs defensively (treats as 0)', () => {
    const { score } = computeLoad({
      ...empty(),
      commentsLastHour:      -10,
      oncallMinutesToday:    Number.NaN,
      minutesSinceLastBreak: -999,
      weeklyOncallMinutes:   Number.POSITIVE_INFINITY,
    });
    // Infinity in weeklyOncallMinutes is filtered to 0 via nonNeg().
    expect(score).toBe(0);
  });

  it('bandFor produces the documented thresholds', () => {
    expect(bandFor(0)).toBe('idle');
    expect(bandFor(0.2)).toBe('normal');
    expect(bandFor(0.5)).toBe('busy');
    expect(bandFor(0.7)).toBe('saturated');
    expect(bandFor(0.95)).toBe('overloaded');
  });

  it('pickFreshestResponder picks the lowest score', () => {
    const a = { score: 0.8, name: 'busy'   };
    const b = { score: 0.2, name: 'fresh'  };
    const c = { score: 0.5, name: 'medium' };
    expect(pickFreshestResponder([a, b, c])?.name).toBe('fresh');
    expect(pickFreshestResponder([])).toBeNull();
  });

  it('contributions add up to the raw pre-saturation pressure sum', () => {
    const result = computeLoad({
      activeIncidentSeverities: ['P1', 'P3'],
      commentsLastHour:         60,
      oncallMinutesToday:       240,
      minutesSinceLastBreak:    180,
      weeklyOncallMinutes:      40 * 60,
    });
    const c = result.breakdown.contributions;
    const total =
      c.severityPressure +
      c.commentVelocity +
      c.oncallToday +
      c.breakDeprivation +
      c.weeklyFatigue;
    // Inverting the saturator: total \u2248 -ln(1 - score).
    const inferred = -Math.log(1 - result.score);
    expect(total).toBeCloseTo(inferred, 6);
  });
});
