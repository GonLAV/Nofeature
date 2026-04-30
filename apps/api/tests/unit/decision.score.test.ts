import { scoreResponder } from '../../src/modules/decisions/decision.score';

const t = (mins: number) => new Date(Date.now() - mins * 60_000);

describe('decision.score / scoreResponder', () => {
  it('returns zeros for an empty ledger', () => {
    const r = scoreResponder([]);
    expect(r.accuracy).toBe(0);
    expect(r.calibration).toBe(0);
    expect(r.current_streak).toBe(0);
    expect(r.resolved_count).toBe(0);
    expect(r.pending_count).toBe(0);
  });

  it('counts pending separately and excludes them from accuracy', () => {
    const r = scoreResponder([
      { status: 'pending', confidence: 80, evaluated_at: null },
      { status: 'pending', confidence: 60, evaluated_at: null },
    ]);
    expect(r.pending_count).toBe(2);
    expect(r.resolved_count).toBe(0);
    expect(r.accuracy).toBe(0);
  });

  it('accuracy is worked / (worked + failed), ignoring inconclusive and reverted', () => {
    const r = scoreResponder([
      { status: 'worked',       confidence: 80, evaluated_at: t(50) },
      { status: 'worked',       confidence: 70, evaluated_at: t(40) },
      { status: 'failed',       confidence: 90, evaluated_at: t(30) },
      { status: 'inconclusive', confidence: 50, evaluated_at: t(20) },
      { status: 'reverted',     confidence: 60, evaluated_at: t(10) },
    ]);
    expect(r.accuracy).toBeCloseTo(2 / 3, 3);
    expect(r.resolved_count).toBe(4); // reverted is excluded
  });

  it('calibration penalises overconfident wrong calls (Brier)', () => {
    const overconfidentWrong = scoreResponder([
      { status: 'failed', confidence: 99, evaluated_at: t(10) },
    ]);
    const humbleWrong = scoreResponder([
      { status: 'failed', confidence: 30, evaluated_at: t(10) },
    ]);
    expect(humbleWrong.calibration).toBeGreaterThan(overconfidentWrong.calibration);
  });

  it('calibration rewards confident, correct calls', () => {
    const r = scoreResponder([
      { status: 'worked', confidence: 95, evaluated_at: t(5) },
      { status: 'worked', confidence: 90, evaluated_at: t(4) },
    ]);
    expect(r.calibration).toBeGreaterThan(0.9);
  });

  it('streak counts consecutive workings at the tail', () => {
    const r = scoreResponder([
      { status: 'failed', confidence: 60, evaluated_at: t(50) },
      { status: 'worked', confidence: 70, evaluated_at: t(40) },
      { status: 'worked', confidence: 70, evaluated_at: t(30) },
      { status: 'worked', confidence: 70, evaluated_at: t(20) },
    ]);
    expect(r.current_streak).toBe(3);
  });

  it('streak breaks on the most recent failure', () => {
    const r = scoreResponder([
      { status: 'worked', confidence: 70, evaluated_at: t(30) },
      { status: 'worked', confidence: 70, evaluated_at: t(20) },
      { status: 'failed', confidence: 70, evaluated_at: t(10) },
    ]);
    expect(r.current_streak).toBe(0);
  });

  it('treats out-of-order timestamps deterministically', () => {
    const a = scoreResponder([
      { status: 'failed', confidence: 70, evaluated_at: t(50) },
      { status: 'worked', confidence: 70, evaluated_at: t(10) },
    ]);
    const b = scoreResponder([
      { status: 'worked', confidence: 70, evaluated_at: t(10) },
      { status: 'failed', confidence: 70, evaluated_at: t(50) },
    ]);
    expect(a).toEqual(b);
    expect(a.current_streak).toBe(1); // most recent is 'worked'
  });

  it('inconclusive contributes 0.5 to Brier and never affects accuracy', () => {
    const r = scoreResponder([
      { status: 'inconclusive', confidence: 50, evaluated_at: t(5) },
    ]);
    expect(r.accuracy).toBe(0);
    expect(r.resolved_count).toBe(1);
    expect(r.calibration).toBe(1); // perfect: confidence 0.5, resolved 0.5
  });

  it('clamps confidence outside 0..100 safely', () => {
    const r = scoreResponder([
      { status: 'worked', confidence: 150, evaluated_at: t(1) },
      { status: 'failed', confidence: -10, evaluated_at: t(2) },
    ]);
    expect(r.calibration).toBe(1); // both perfectly calibrated after clamp
  });
});
