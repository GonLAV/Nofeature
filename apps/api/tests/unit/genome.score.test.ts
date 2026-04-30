/**
 * Pure-math tests for the Incident Genome scoring layer.
 * No DB, no network \u2014 these are the contract tests for the
 * vector design itself.
 */

import {
  computeGenome,
  cosineSimilarity,
  explainSimilarity,
  GENOME_DIMS,
  GENOME_SCHEMA_VERSION,
  FEATURE_NAMES,
} from '../../src/modules/genome/genome.score';

const baseInput = () => ({
  severity:           'P3' as const,
  durationMinutes:    60,
  affectedSystems:    1,
  serviceCount:       1,
  responderCount:     2,
  commentCount:       3,
  timelineEventCount: 6,
  earlyActionRatio:   0.5,
  statusValues:       2,
  tagCount:           1,
});

describe('Incident Genome \u00d7 scoring', () => {
  it('emits a vector of fixed dimensionality (GENOME_DIMS)', () => {
    const { vector } = computeGenome(baseInput());
    expect(vector.length).toBe(GENOME_DIMS);
    expect(FEATURE_NAMES.length).toBe(GENOME_DIMS);
    expect(GENOME_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('clamps every component into [0, 1]', () => {
    // Wildly large signal \u2014 should saturate, never overflow.
    const { vector } = computeGenome({
      ...baseInput(),
      affectedSystems:    999,
      serviceCount:       999,
      responderCount:     999,
      commentCount:       100_000,
      timelineEventCount: 100_000,
      tagCount:           999,
      durationMinutes:    100_000,
      statusValues:       999,
    });
    vector.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it('weights severity P1 > P2 > P3 > P4 monotonically', () => {
    const sevs = ['P1', 'P2', 'P3', 'P4'] as const;
    const weights = sevs.map((s) => computeGenome({ ...baseInput(), severity: s }).vector[0]);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(weights[0]).toBe(1);
    expect(weights[3]).toBe(0);
  });

  it('treats null durationMinutes as 0 (open incidents stay sane)', () => {
    const { vector } = computeGenome({ ...baseInput(), durationMinutes: null });
    expect(vector[1]).toBe(0); // duration_norm
  });

  it('cosine similarity \u2192 1 for identical vectors, 0 for orthogonal, 0 for zero-mag', () => {
    const a = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    const z = new Array(GENOME_DIMS).fill(0);

    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 6);
    expect(cosineSimilarity(z, a)).toBe(0);
    expect(cosineSimilarity(a, z)).toBe(0);
  });

  it('cosine similarity throws on length mismatch (loud failure beats silent corruption)', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });

  it('two structurally similar incidents score high; two opposite incidents score low', () => {
    // A: fast P1, lots of responders, dense early action
    const a = computeGenome({
      severity:           'P1',
      durationMinutes:    30,
      affectedSystems:    4,
      serviceCount:       3,
      responderCount:     6,
      commentCount:       20,
      timelineEventCount: 30,
      earlyActionRatio:   0.7,
      statusValues:       3,
      tagCount:           2,
    }).vector;
    // B: very similar shape, slightly different magnitudes
    const b = computeGenome({
      severity:           'P1',
      durationMinutes:    45,
      affectedSystems:    3,
      serviceCount:       4,
      responderCount:     5,
      commentCount:       18,
      timelineEventCount: 28,
      earlyActionRatio:   0.65,
      statusValues:       3,
      tagCount:           2,
    }).vector;
    // C: a sleepy P4 with nothing happening
    const c = computeGenome({
      severity:           'P4',
      durationMinutes:    240,
      affectedSystems:    0,
      serviceCount:       0,
      responderCount:     1,
      commentCount:       0,
      timelineEventCount: 1,
      earlyActionRatio:   0,
      statusValues:       1,
      tagCount:           0,
    }).vector;

    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);
    expect(simAB).toBeGreaterThan(0.95);
    expect(simAC).toBeLessThan(simAB);
  });

  it('explainSimilarity returns one entry per dimension that sums (approximately) to the cosine', () => {
    const a = computeGenome(baseInput()).vector;
    const b = computeGenome({ ...baseInput(), severity: 'P1' }).vector;
    const contribs = explainSimilarity(a, b);
    expect(contribs.length).toBe(GENOME_DIMS);
    const total = contribs.reduce((s, c) => s + c.contribution, 0);
    expect(total).toBeCloseTo(cosineSimilarity(a, b), 6);
  });
});
