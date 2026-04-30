import {
  MITIGATION_SCHEMA_VERSION,
  summariseMitigation,
  type MitigationApplication,
} from '../../src/modules/dna/mitigation.score';

describe('mitigation.score', () => {
  it('exports the schema version', () => {
    expect(MITIGATION_SCHEMA_VERSION).toBe(1);
  });

  it('returns "unknown" for empty input and never NaN', () => {
    const s = summariseMitigation([]);
    expect(s.sampleSize).toBe(0);
    expect(s.successRate).toBe(0);
    expect(s.successLowerBound).toBe(0);
    expect(s.mttrLiftSeconds).toBe(0);
    expect(s.recommendation).toBe('unknown');
  });

  it('ignores unevaluated rows in success rate', () => {
    const apps: MitigationApplication[] = [
      { effective: null,  mttrDeltaSeconds: null },
      { effective: true,  mttrDeltaSeconds: -120 },
      { effective: true,  mttrDeltaSeconds: -60  },
    ];
    const s = summariseMitigation(apps);
    expect(s.sampleSize).toBe(2);
    expect(s.successRate).toBe(1);
    expect(s.mttrLiftSeconds).toBe(90); // mean of 120 and 60
  });

  it('penalises small samples via Wilson lower bound', () => {
    const tiny = summariseMitigation([{ effective: true, mttrDeltaSeconds: -60 }]);
    const big = summariseMitigation(
      Array.from({ length: 50 }, () => ({ effective: true, mttrDeltaSeconds: -60 })),
    );
    expect(tiny.successLowerBound).toBeLessThan(big.successLowerBound);
    expect(tiny.recommendation).not.toBe('strong');
    expect(big.recommendation).toBe('strong');
  });

  it('clamps mttrLift to non-negative (positive deltas mean MTTR got worse)', () => {
    const s = summariseMitigation([
      { effective: true, mttrDeltaSeconds: 300 },
    ]);
    expect(s.mttrLiftSeconds).toBe(0);
  });

  it('treats Infinity / NaN deltas as missing', () => {
    const s = summariseMitigation([
      { effective: true, mttrDeltaSeconds: Number.POSITIVE_INFINITY },
      { effective: true, mttrDeltaSeconds: Number.NaN },
    ]);
    expect(s.mttrLiftSeconds).toBe(0);
  });

  it('classifies mixed evidence as "mixed" or "weak"', () => {
    const apps: MitigationApplication[] = [
      ...Array.from({ length: 5 }, () => ({ effective: true,  mttrDeltaSeconds: -60 } as MitigationApplication)),
      ...Array.from({ length: 5 }, () => ({ effective: false, mttrDeltaSeconds: 30  } as MitigationApplication)),
    ];
    const s = summariseMitigation(apps);
    expect(['mixed', 'weak']).toContain(s.recommendation);
  });
});
