/**
 * Incident Genome \u2014 pure scoring math.
 *
 * Vector design (v1, 10 dims, all in [0, 1]):
 *
 *   0  severity_weight        P1=1.0, P2=0.66, P3=0.33, P4=0.0
 *   1  duration_norm          minutes / 240, capped at 1
 *   2  affected_systems_norm  count / 10, capped at 1
 *   3  service_count_norm     count / 10, capped at 1
 *   4  responder_count_norm   distinct timeline user_ids / 8
 *   5  comment_density        comments / max(1, duration_min/10)
 *   6  timeline_event_density timeline rows / max(1, duration_min/10)
 *   7  early_action_ratio     fraction of timeline events in the
 *                             first 25% of duration \u2014 measures how
 *                             fast the team mobilised
 *   8  status_thrash          distinct status values / 4 \u2014 a proxy
 *                             for confidence flips during the response
 *   9  tag_count_norm         tags / 6
 *
 * Why these features
 * \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * Each is *response-shape* (how the team behaved), not just metadata
 * (what the incident was about). A login-service P2 with explosive
 * mobilisation and high comment density looks more like a payments
 * P1 with the same shape than like another sleepy login P2 \u2014 and
 * that's exactly what an on-call engineer wants to know.
 *
 * All features are normalised so cosine similarity is well-behaved
 * (no single dim dominates). Caps are deliberately generous; we'd
 * rather saturate than have outliers (a 12-hour incident) skew
 * everything else.
 */

export const GENOME_SCHEMA_VERSION = 1;
export const GENOME_DIMS = 10;

export interface GenomeInput {
  severity:           'P1' | 'P2' | 'P3' | 'P4';
  durationMinutes:    number | null; // null \u21d2 still open
  affectedSystems:    number;
  serviceCount:       number;
  responderCount:     number;
  commentCount:       number;
  timelineEventCount: number;
  earlyActionRatio:   number; // already in [0,1]
  statusValues:       number; // distinct count
  tagCount:           number;
}

export interface GenomeBreakdown {
  severityWeight:       number;
  durationNorm:         number;
  affectedSystemsNorm:  number;
  serviceCountNorm:     number;
  responderCountNorm:   number;
  commentDensity:       number;
  timelineEventDensity: number;
  earlyActionRatio:     number;
  statusThrash:         number;
  tagCountNorm:         number;
}

const SEVERITY_WEIGHTS: Record<GenomeInput['severity'], number> = {
  P1: 1.0,
  P2: 0.66,
  P3: 0.33,
  P4: 0.0,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export function computeGenome(input: GenomeInput): {
  vector:     number[];
  components: GenomeBreakdown;
} {
  // For open incidents we still want a meaningful duration; use
  // "elapsed so far" semantics by treating null as 0 \u2014 caller is
  // expected to pass elapsed minutes for live incidents.
  const durationMin = Math.max(0, input.durationMinutes ?? 0);
  // Density denominator: per-10-minute window. Avoids div/0 on
  // brand-new incidents (everything reads as 0 density, which is fine).
  const window = Math.max(1, durationMin / 10);

  const components: GenomeBreakdown = {
    severityWeight:       SEVERITY_WEIGHTS[input.severity],
    durationNorm:         clamp01(durationMin / 240),
    affectedSystemsNorm:  clamp01(input.affectedSystems    / 10),
    serviceCountNorm:     clamp01(input.serviceCount        / 10),
    responderCountNorm:   clamp01(input.responderCount      /  8),
    commentDensity:       clamp01(input.commentCount        / window),
    timelineEventDensity: clamp01(input.timelineEventCount  / window),
    earlyActionRatio:     clamp01(input.earlyActionRatio),
    statusThrash:         clamp01(input.statusValues        /  4),
    tagCountNorm:         clamp01(input.tagCount            /  6),
  };

  const vector = [
    components.severityWeight,
    components.durationNorm,
    components.affectedSystemsNorm,
    components.serviceCountNorm,
    components.responderCountNorm,
    components.commentDensity,
    components.timelineEventDensity,
    components.earlyActionRatio,
    components.statusThrash,
    components.tagCountNorm,
  ];

  return { vector, components };
}

/**
 * Cosine similarity in [-1, 1]. Returns 0 for zero-magnitude vectors
 * (a brand-new incident with zero signal genuinely matches nothing).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Per-dimension contribution: how much each feature pushed the
 * cosine similarity up or down. Powers the "why these match" UI.
 */
export function explainSimilarity(
  query: number[],
  candidate: number[],
): { dim: number; contribution: number }[] {
  const magA = Math.sqrt(query.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(candidate.reduce((s, v) => s + v * v, 0));
  if (magA === 0 || magB === 0) return [];
  const denom = magA * magB;
  return query.map((v, i) => ({
    dim:          i,
    contribution: (v * candidate[i]) / denom,
  }));
}

export const FEATURE_NAMES: readonly string[] = [
  'severity',
  'duration',
  'affected_systems',
  'service_count',
  'responder_count',
  'comment_density',
  'timeline_density',
  'early_action_ratio',
  'status_thrash',
  'tag_count',
] as const;
