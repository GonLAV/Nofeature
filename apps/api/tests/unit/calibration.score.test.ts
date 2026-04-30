import {
  CALIBRATION_SCHEMA_VERSION,
  brierScore,
  logLoss,
  reliabilityBins,
  calibrationIndex,
  resolution,
  summarise,
  type ResolvedPrediction,
} from '../../src/modules/calibration/calibration.score';

const perfect: ResolvedPrediction[] = [
  { confidence: 0.0, correct: false },
  { confidence: 0.0, correct: false },
  { confidence: 1.0, correct: true },
  { confidence: 1.0, correct: true },
];

const overconfident: ResolvedPrediction[] = [
  // Said 90%, only 50% right
  { confidence: 0.9, correct: true },
  { confidence: 0.9, correct: false },
  { confidence: 0.9, correct: true },
  { confidence: 0.9, correct: false },
];

describe('calibration.score', () => {
  it('exports the schema version', () => {
    expect(CALIBRATION_SCHEMA_VERSION).toBe(1);
  });

  describe('brierScore', () => {
    it('returns 0 for an empty input (neutral)', () => {
      expect(brierScore([])).toBe(0);
    });

    it('is 0 for a perfectly accurate forecaster', () => {
      expect(brierScore(perfect)).toBeCloseTo(0, 10);
    });

    it('is 1 for a maximally wrong forecaster', () => {
      expect(brierScore([
        { confidence: 1, correct: false },
        { confidence: 0, correct: true  },
      ])).toBeCloseTo(1, 10);
    });

    it('clamps malformed confidences', () => {
      expect(brierScore([{ confidence: 2, correct: true }])).toBeCloseTo(0, 10);
      expect(brierScore([{ confidence: -1, correct: false }])).toBeCloseTo(0, 10);
    });
  });

  describe('logLoss', () => {
    it('is finite even when stated p is exactly 0 or 1 and wrong', () => {
      const ll = logLoss([
        { confidence: 1, correct: false },
        { confidence: 0, correct: true  },
      ]);
      expect(Number.isFinite(ll)).toBe(true);
      expect(ll).toBeGreaterThan(10); // huge but finite
    });

    it('is small for confident-and-correct predictions', () => {
      const ll = logLoss([
        { confidence: 0.99, correct: true },
        { confidence: 0.01, correct: false },
      ]);
      expect(ll).toBeLessThan(0.1);
    });
  });

  describe('reliabilityBins', () => {
    it('drops empty bins', () => {
      const bins = reliabilityBins([
        { confidence: 0.05, correct: false },
        { confidence: 0.95, correct: true },
      ], 10);
      expect(bins).toHaveLength(2);
      expect(bins[0].from).toBe(0.0);
      expect(bins[1].to).toBe(1.0);
    });

    it('handles confidence of exactly 1 by placing it in the top bin', () => {
      const bins = reliabilityBins([{ confidence: 1, correct: true }], 10);
      expect(bins).toHaveLength(1);
      expect(bins[0].to).toBe(1);
      expect(bins[0].count).toBe(1);
    });
  });

  describe('calibrationIndex', () => {
    it('returns 1 with no evidence', () => {
      expect(calibrationIndex([])).toBe(1);
    });

    it('approaches 1 for a perfect forecaster', () => {
      const bins = reliabilityBins(perfect, 10);
      expect(calibrationIndex(bins)).toBeCloseTo(1, 6);
    });

    it('penalises the systematically overconfident', () => {
      const bins = reliabilityBins(overconfident, 10);
      // Stated mean ~0.9, accuracy 0.5 → gap 0.4 → index 0.6
      expect(calibrationIndex(bins)).toBeCloseTo(0.6, 6);
    });
  });

  describe('resolution', () => {
    it('is 0 when there is no evidence', () => {
      expect(resolution([], [])).toBe(0);
    });

    it('is positive when bins discriminate above and below the base rate', () => {
      const preds: ResolvedPrediction[] = [
        { confidence: 0.1, correct: false },
        { confidence: 0.1, correct: false },
        { confidence: 0.9, correct: true  },
        { confidence: 0.9, correct: true  },
      ];
      const bins = reliabilityBins(preds, 10);
      expect(resolution(preds, bins)).toBeGreaterThan(0);
    });
  });

  describe('summarise', () => {
    it('packages every metric in a single object', () => {
      const r = summarise(perfect, 10);
      expect(r.schemaVersion).toBe(1);
      expect(r.total).toBe(4);
      expect(r.brier).toBeCloseTo(0, 10);
      expect(r.calibrationIndex).toBeCloseTo(1, 6);
      expect(r.bins.length).toBeGreaterThan(0);
    });

    it('returns neutral metrics on empty input', () => {
      const r = summarise([]);
      expect(r.total).toBe(0);
      expect(r.brier).toBe(0);
      expect(r.logLoss).toBe(0);
      expect(r.calibrationIndex).toBe(1);
      expect(r.resolution).toBe(0);
      expect(r.bins).toEqual([]);
    });
  });
});
