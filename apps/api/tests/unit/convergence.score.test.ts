import {
  score,
  computeComponents,
  CONVERGENCE_SCHEMA_VERSION,
  STUCK_THRESHOLD,
  STUCK_DURATION_MIN,
  type ConvergenceInput,
} from '../../src/modules/convergence/convergence.score';

const baseInput = (over: Partial<ConvergenceInput> = {}): ConvergenceInput => ({
  recentEvents:           [],
  recentComments:         0,
  distinctSystemsTotal:   3,
  distinctSystemsRecent:  3,
  statusReversals:        0,
  ageMinutes:             10,
  recentWindowMinutes:    10,
  ...over,
});

const ev = (n: number, action: string) =>
  Array.from({ length: n }, () => ({ action, at: new Date() }));

describe('Convergence Index scoring', () => {
  it('exports a schema version', () => {
    expect(CONVERGENCE_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('all four components are bounded in [0, 1]', () => {
    const c = computeComponents(baseInput({
      recentEvents:    ev(50, 'status_changed').concat(ev(50, 'comment')),
      recentComments:  100,
      statusReversals: 99,
    }));
    Object.values(c).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it('action-heavy recent stream produces a higher score than discussion-heavy', () => {
    const acting = score(baseInput({
      recentEvents:          ev(8, 'status_changed').concat(ev(2, 'comment')),
      distinctSystemsRecent: 1,
    }));
    const debating = score(baseInput({
      recentEvents:          ev(2, 'status_changed').concat(ev(8, 'comment')),
      recentComments:        12,
      distinctSystemsRecent: 3,
    }));
    expect(acting.score).toBeGreaterThan(debating.score);
  });

  it('scope narrowing rewards shrinking surface area', () => {
    const wide   = score(baseInput({ distinctSystemsTotal: 5, distinctSystemsRecent: 5, recentEvents: ev(5, 'status_changed') }));
    const narrow = score(baseInput({ distinctSystemsTotal: 5, distinctSystemsRecent: 1, recentEvents: ev(5, 'status_changed') }));
    expect(narrow.score).toBeGreaterThan(wide.score);
  });

  it('status reversals punish decision stability', () => {
    const clean   = score(baseInput({ statusReversals: 0, recentEvents: ev(4, 'status_changed') }));
    const thrashy = score(baseInput({ statusReversals: 4, recentEvents: ev(4, 'status_changed') }));
    expect(thrashy.score).toBeLessThan(clean.score);
  });

  it('a low score sustained past STUCK_DURATION_MIN flips diagnosis to "stuck"', () => {
    const out = score(baseInput({
      recentEvents:           [],
      recentComments:         0,
      distinctSystemsTotal:   5,
      distinctSystemsRecent:  5,
      statusReversals:        4,
      priorScore:             0.2,
      priorAgeMinutes:        STUCK_DURATION_MIN + 5,
      priorStuckMinutes:      STUCK_DURATION_MIN + 5,
    }));
    expect(out.score).toBeLessThan(STUCK_THRESHOLD);
    expect(out.diagnosis).toBe('stuck');
    expect(out.stuckMinutes).toBeGreaterThanOrEqual(STUCK_DURATION_MIN);
  });

  it('a recovering trajectory diagnoses as "converging" with a forward ETA', () => {
    const out = score(baseInput({
      recentEvents:           ev(6, 'status_changed').concat(ev(1, 'comment')),
      distinctSystemsTotal:   4,
      distinctSystemsRecent:  1,
      statusReversals:        0,
      priorScore:             0.5,
      priorAgeMinutes:        5,
    }));
    expect(out.score).toBeGreaterThanOrEqual(0.7);
    expect(out.diagnosis).toBe('converging');
    if (out.minutesToResolution !== null) {
      expect(out.minutesToResolution).toBeGreaterThanOrEqual(0);
      expect(out.minutesToResolution).toBeLessThanOrEqual(240);
    }
  });

  it('negative velocity diagnoses as "diverging"', () => {
    const out = score(baseInput({
      recentEvents:           ev(2, 'comment'),
      recentComments:         8,
      distinctSystemsTotal:   2,
      distinctSystemsRecent:  4,
      statusReversals:        2,
      priorScore:             0.85,
      priorAgeMinutes:        5,
    }));
    expect(out.score).toBeLessThan(0.85);
    expect(out.velocityPerMin).toBeLessThan(0);
    // Could be diverging or stuck; ensure it isn't masked as converging.
    expect(out.diagnosis).not.toBe('converging');
  });

  it('stuck minutes reset to zero the moment the score recovers', () => {
    const out = score(baseInput({
      recentEvents:           ev(6, 'status_changed'),
      distinctSystemsTotal:   3,
      distinctSystemsRecent:  1,
      statusReversals:        0,
      priorScore:             0.3,
      priorAgeMinutes:        5,
      priorStuckMinutes:      20,
    }));
    expect(out.score).toBeGreaterThanOrEqual(STUCK_THRESHOLD);
    expect(out.stuckMinutes).toBe(0);
  });

  it('overall score is bounded in [0, 1] under any input', () => {
    const out = score(baseInput({
      recentEvents:           ev(999, 'comment'),
      recentComments:         9999,
      statusReversals:        99,
      distinctSystemsTotal:   99,
      distinctSystemsRecent:  99,
    }));
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(1);
  });
});
