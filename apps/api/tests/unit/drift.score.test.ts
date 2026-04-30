import {
  DRIFT_SCHEMA_VERSION,
  textDriftMagnitude,
  severityDriftMagnitude,
  tagsDriftMagnitude,
  summariseDrift,
} from '../../src/modules/drift/drift.score';

const at = (mins: number) => new Date(Date.UTC(2026, 0, 1, 12, mins, 0));

describe('drift.score', () => {
  it('exports the schema version', () => {
    expect(DRIFT_SCHEMA_VERSION).toBe(1);
  });

  describe('textDriftMagnitude', () => {
    it('returns 0 for identical strings (and trims)', () => {
      expect(textDriftMagnitude('  hi  ', 'hi')).toBe(0);
    });
    it('returns 1 for completely different strings', () => {
      expect(textDriftMagnitude('abcd', 'wxyz')).toBe(1);
    });
    it('returns ~0.5 for half-rewrites', () => {
      const m = textDriftMagnitude('abcdefgh', 'abcdwxyz');
      expect(m).toBeCloseTo(0.5, 5);
    });
    it('handles empty inputs', () => {
      expect(textDriftMagnitude('', '')).toBe(0);
      expect(textDriftMagnitude('hi', '')).toBe(1);
    });
  });

  describe('severityDriftMagnitude', () => {
    it('returns 0 for unchanged severity', () => {
      expect(severityDriftMagnitude('P2', 'P2')).toBe(0);
    });
    it('scales linearly across P1..P4', () => {
      expect(severityDriftMagnitude('P1', 'P2')).toBeCloseTo(1 / 3, 5);
      expect(severityDriftMagnitude('P1', 'P4')).toBe(1);
    });
    it('returns 1 for unknown severity values', () => {
      expect(severityDriftMagnitude('P2', 'X')).toBe(1);
    });
  });

  describe('tagsDriftMagnitude', () => {
    it('handles empty + identical sets', () => {
      expect(tagsDriftMagnitude([], [])).toBe(0);
      expect(tagsDriftMagnitude(['api'], ['API'])).toBe(0);
    });
    it('returns 1 for fully disjoint sets', () => {
      expect(tagsDriftMagnitude(['a'], ['b'])).toBe(1);
    });
    it('returns 1 - jaccard for partial overlap', () => {
      expect(tagsDriftMagnitude(['a', 'b'], ['b', 'c'])).toBeCloseTo(2 / 3, 5);
    });
  });

  describe('summariseDrift', () => {
    it('returns empty stats with no events', () => {
      const s = summariseDrift([]);
      expect(s.totalEvents).toBe(0);
      expect(s.driftIndex).toBe(0);
    });

    it('weights recent events heavier than older ones', () => {
      const now = at(0);
      const oldEvents = [{ field: 'title' as const, magnitude: 1, createdAt: at(-600) }];
      const newEvents = [{ field: 'title' as const, magnitude: 1, createdAt: at(0) }];
      const oldS = summariseDrift(oldEvents, { now, halfLifeMinutes: 60 });
      const newS = summariseDrift(newEvents, { now, halfLifeMinutes: 60 });
      expect(newS.weightedScore).toBeGreaterThan(oldS.weightedScore);
      expect(newS.driftIndex).toBeGreaterThan(oldS.driftIndex);
    });

    it('aggregates by field and bounds driftIndex in [0,1)', () => {
      const now = at(0);
      const events = [
        { field: 'title' as const,            magnitude: 0.4, createdAt: at(-5) },
        { field: 'description' as const,      magnitude: 0.6, createdAt: at(-10) },
        { field: 'severity' as const,         magnitude: 0.3, createdAt: at(-15) },
        { field: 'affected_systems' as const, magnitude: 0.5, createdAt: at(-2) },
      ];
      const s = summariseDrift(events, { now, halfLifeMinutes: 60 });
      expect(s.totalEvents).toBe(4);
      expect(s.byField.title).toBeCloseTo(0.4, 4);
      expect(s.byField.affected_systems).toBeCloseTo(0.5, 4);
      expect(s.driftIndex).toBeGreaterThan(0);
      expect(s.driftIndex).toBeLessThan(1);
    });

    it('clamps invalid magnitudes', () => {
      const now = at(0);
      const events = [
        { field: 'title' as const, magnitude: 5,    createdAt: at(0) },
        { field: 'title' as const, magnitude: -1,   createdAt: at(0) },
        { field: 'title' as const, magnitude: NaN,  createdAt: at(0) },
      ];
      const s = summariseDrift(events, { now });
      expect(s.byField.title).toBeCloseTo(1, 4);
    });
  });
});
