/**
 * Pure analytics for the Confidence Gradient feature.
 *
 * Given an ordered series of confidence readings during an incident we
 * compute:
 *   - an average gradient (Δconfidence / Δseconds) over the whole window
 *   - a list of inflection points: indices where the moving-average dropped
 *     by at least `dropThreshold` between two adjacent readings, after we
 *     smooth out noise from individual readers disagreeing.
 *
 * Everything in here is deterministic & dependency-free so it can be
 * unit-tested without a database.
 */

export const CONFIDENCE_SCHEMA_VERSION = 1;

export interface ConfidencePoint {
  recordedAt: Date;
  confidence: number; // 0..1
}

export interface AggregatedPoint extends ConfidencePoint {
  count: number;      // how many readers contributed at this bucket
}

export interface ConfidenceGradientStats {
  schemaVersion:    number;
  count:            number;
  averageConfidence: number;
  finalConfidence:  number | null;
  startedAt:        Date | null;
  endedAt:          Date | null;
  /** average slope per minute over the whole series */
  slopePerMinute:   number;
  inflections:      Array<{
    at:       Date;
    fromConfidence: number;
    toConfidence:   number;
    drop:     number;     // positive number = how much confidence fell
  }>;
}

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Bucket multiple readers' readings into per-minute averages so the gradient
 * isn't dominated by whoever clicks the button most frequently.
 */
export const bucketByMinute = (
  points: readonly ConfidencePoint[],
): AggregatedPoint[] => {
  if (points.length === 0) return [];
  const buckets = new Map<number, { sum: number; count: number; ts: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.confidence)) continue;
    const c = Math.min(1, Math.max(0, p.confidence));
    const minute = Math.floor(p.recordedAt.getTime() / 60_000);
    const cur = buckets.get(minute);
    if (cur) {
      cur.sum += c;
      cur.count += 1;
    } else {
      buckets.set(minute, { sum: c, count: 1, ts: minute * 60_000 });
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.ts - b.ts)
    .map((b) => ({
      recordedAt: new Date(b.ts),
      confidence: round(b.sum / b.count),
      count:      b.count,
    }));
};

export const summariseConfidence = (
  points: readonly ConfidencePoint[],
  opts: { dropThreshold?: number } = {},
): ConfidenceGradientStats => {
  const dropThreshold = opts.dropThreshold ?? 0.2;
  const buckets = bucketByMinute(points);

  if (buckets.length === 0) {
    return {
      schemaVersion: CONFIDENCE_SCHEMA_VERSION,
      count: 0,
      averageConfidence: 0,
      finalConfidence: null,
      startedAt: null,
      endedAt:   null,
      slopePerMinute: 0,
      inflections: [],
    };
  }

  const totalConfidence = buckets.reduce((a, b) => a + b.confidence, 0);
  const averageConfidence = round(totalConfidence / buckets.length);

  const startedAt = buckets[0].recordedAt;
  const endedAt   = buckets[buckets.length - 1].recordedAt;
  const finalConfidence = buckets[buckets.length - 1].confidence;

  let slopePerMinute = 0;
  if (buckets.length >= 2) {
    const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000;
    slopePerMinute = minutes > 0
      ? round((finalConfidence - buckets[0].confidence) / minutes)
      : 0;
  }

  const inflections: ConfidenceGradientStats['inflections'] = [];
  for (let i = 1; i < buckets.length; i += 1) {
    const drop = buckets[i - 1].confidence - buckets[i].confidence;
    if (drop >= dropThreshold) {
      inflections.push({
        at: buckets[i].recordedAt,
        fromConfidence: buckets[i - 1].confidence,
        toConfidence:   buckets[i].confidence,
        drop:           round(drop),
      });
    }
  }

  return {
    schemaVersion:    CONFIDENCE_SCHEMA_VERSION,
    count:            buckets.length,
    averageConfidence,
    finalConfidence,
    startedAt,
    endedAt,
    slopePerMinute,
    inflections,
  };
};
