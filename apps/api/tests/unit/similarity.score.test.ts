import {
  DOPPELGANGER_SCHEMA_VERSION,
  jaccard,
  normaliseTsRank,
  rankDoppelgangers,
  type DoppelgangerCandidate,
} from '../../src/modules/doppelgangers/similarity.score';

const cand = (over: Partial<DoppelgangerCandidate> = {}): DoppelgangerCandidate => ({
  id:              'i' + Math.random().toString(36).slice(2, 8),
  title:           'x',
  severity:        'P3',
  status:          'resolved',
  resolvedAt:      null,
  createdAt:       new Date('2026-01-01T00:00:00Z'),
  affectedSystems: [],
  tsRank:          0.1,
  ...over,
});

describe('similarity.score', () => {
  it('exports the schema version', () => {
    expect(DOPPELGANGER_SCHEMA_VERSION).toBe(1);
  });

  it('jaccard handles empties and normalises case/whitespace', () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(['api'], [])).toBe(0);
    expect(jaccard(['api', 'cache'], ['CACHE', '  api '])).toBe(1);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('normaliseTsRank squashes to [0,1) and handles bad inputs', () => {
    expect(normaliseTsRank(0)).toBe(0);
    expect(normaliseTsRank(-1)).toBe(0);
    expect(normaliseTsRank(NaN)).toBe(0);
    expect(normaliseTsRank(Infinity)).toBe(0);
    expect(normaliseTsRank(1)).toBeCloseTo(0.5, 5);
    expect(normaliseTsRank(99)).toBeLessThan(1);
  });

  it('blends text and tag scores with default weights', () => {
    const ranked = rankDoppelgangers(
      { tags: ['api', 'cache'] },
      [
        cand({ id: 'A', tsRank: 1, affectedSystems: ['api', 'cache'] }), // text 0.5, tag 1.0
        cand({ id: 'B', tsRank: 5, affectedSystems: [] }),               // text 0.83, tag 0
        cand({ id: 'C', tsRank: 0, affectedSystems: ['api'] }),          // text 0, tag 0.5
      ],
    );
    expect(ranked.map((r) => r.id)).toEqual(['A', 'B', 'C']);
    expect(ranked[0].blendedScore).toBeGreaterThan(ranked[1].blendedScore);
  });

  it('honours custom weights and limit', () => {
    const ranked = rankDoppelgangers(
      { tags: ['api'] },
      [
        cand({ id: 'A', tsRank: 0.1, affectedSystems: ['api'] }),
        cand({ id: 'B', tsRank: 10,  affectedSystems: [] }),
      ],
      { textWeight: 0, tagWeight: 1, limit: 1 },
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('A');
  });

  it('falls back to text-only when both weights are zero', () => {
    const ranked = rankDoppelgangers(
      { tags: ['api'] },
      [
        cand({ id: 'A', tsRank: 5,   affectedSystems: ['api'] }),
        cand({ id: 'B', tsRank: 0.1, affectedSystems: ['api', 'cache'] }),
      ],
      { textWeight: 0, tagWeight: 0 },
    );
    expect(ranked[0].id).toBe('A');
  });
});
