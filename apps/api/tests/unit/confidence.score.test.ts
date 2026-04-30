import {
  bucketByMinute,
  CONFIDENCE_SCHEMA_VERSION,
  summariseConfidence,
} from '../../src/modules/confidence/confidence.score';

const at = (mins: number) => new Date(Date.UTC(2026, 0, 1, 0, mins, 0));

describe('confidence.score', () => {
  it('exports the schema version', () => {
    expect(CONFIDENCE_SCHEMA_VERSION).toBe(1);
  });

  it('returns empty stats when there are no readings', () => {
    const s = summariseConfidence([]);
    expect(s.count).toBe(0);
    expect(s.startedAt).toBeNull();
    expect(s.endedAt).toBeNull();
    expect(s.finalConfidence).toBeNull();
    expect(s.slopePerMinute).toBe(0);
    expect(s.inflections).toEqual([]);
  });

  it('buckets multiple readers per minute and clamps invalid confidence', () => {
    const buckets = bucketByMinute([
      { recordedAt: at(0), confidence: 0.6 },
      { recordedAt: at(0), confidence: 0.8 },
      { recordedAt: at(1), confidence: 1.5 },     // clamped to 1
      { recordedAt: at(1), confidence: NaN },     // dropped
      { recordedAt: at(2), confidence: -1 },      // clamped to 0
    ]);
    expect(buckets).toHaveLength(3);
    expect(buckets[0].confidence).toBeCloseTo(0.7, 5);
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].confidence).toBe(1);
    expect(buckets[2].confidence).toBe(0);
  });

  it('computes slope per minute and detects inflections', () => {
    const s = summariseConfidence(
      [
        { recordedAt: at(0), confidence: 0.9 },
        { recordedAt: at(1), confidence: 0.8 },
        { recordedAt: at(2), confidence: 0.4 },   // drop of 0.4 → inflection
        { recordedAt: at(3), confidence: 0.5 },
        { recordedAt: at(4), confidence: 0.5 },
      ],
      { dropThreshold: 0.2 },
    );

    expect(s.count).toBe(5);
    expect(s.startedAt).toEqual(at(0));
    expect(s.endedAt).toEqual(at(4));
    expect(s.finalConfidence).toBe(0.5);
    // (0.5 - 0.9) / 4 minutes = -0.1
    expect(s.slopePerMinute).toBeCloseTo(-0.1, 5);
    expect(s.inflections).toHaveLength(1);
    expect(s.inflections[0].drop).toBeCloseTo(0.4, 5);
    expect(s.inflections[0].at).toEqual(at(2));
  });

  it('threshold filters out small dips', () => {
    const s = summariseConfidence(
      [
        { recordedAt: at(0), confidence: 0.6 },
        { recordedAt: at(1), confidence: 0.55 },
      ],
      { dropThreshold: 0.2 },
    );
    expect(s.inflections).toHaveLength(0);
  });
});
