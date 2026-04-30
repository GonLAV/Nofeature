/**
 * Pure ranking helpers for the Doppelgangers (similar incident) search.
 *
 * Postgres ts_rank gives us a lexical relevance score; we blend it with a
 * Jaccard overlap on the `affected_systems` tag arrays so two incidents that
 * touch the same service rank ahead of one that just shares vocabulary.
 *
 * The blended score is in [0, 1]:
 *   score = w_text * normalisedTextScore + w_tags * jaccard
 *
 * Text scores from ts_rank are unbounded above, so we squash via x/(1+x)
 * before blending. This is purely deterministic and unit-testable.
 */

export const DOPPELGANGER_SCHEMA_VERSION = 1;

export const DEFAULT_TEXT_WEIGHT = 0.7;
export const DEFAULT_TAG_WEIGHT  = 0.3;

/** Squash an unbounded non-negative ts_rank score into [0, 1). */
export const normaliseTsRank = (raw: number): number => {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw / (1 + raw);
};

/** Symmetric Jaccard similarity between two tag sets. Empty inputs → 0. */
export const jaccard = (a: readonly string[], b: readonly string[]): number => {
  if (a.length === 0 && b.length === 0) return 0;
  const A = new Set(a.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const B = new Set(b.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

export interface DoppelgangerCandidate {
  id:               string;
  title:            string;
  severity:         string;
  status:           string;
  resolvedAt:       Date | null;
  createdAt:        Date;
  affectedSystems:  string[];
  tsRank:           number;          // raw ts_rank from Postgres
}

export interface RankedDoppelganger extends DoppelgangerCandidate {
  textScore:    number;     // 0..1
  tagScore:     number;     // 0..1
  blendedScore: number;     // 0..1
}

/**
 * Blend text + tag signals into a single 0..1 score. Weights default to
 * 70/30 text/tags but are configurable so callers can experiment.
 */
export const rankDoppelgangers = (
  query: { tags: readonly string[] },
  candidates: readonly DoppelgangerCandidate[],
  opts: { textWeight?: number; tagWeight?: number; limit?: number } = {},
): RankedDoppelganger[] => {
  const wt = opts.textWeight ?? DEFAULT_TEXT_WEIGHT;
  const wg = opts.tagWeight  ?? DEFAULT_TAG_WEIGHT;
  // Normalise so weights always sum to 1, even when the caller passes weird
  // values. Falls back to text-only if both are zero.
  const sum = wt + wg;
  const Wt = sum > 0 ? wt / sum : 1;
  const Wg = sum > 0 ? wg / sum : 0;

  const ranked: RankedDoppelganger[] = candidates.map((c) => {
    const textScore = normaliseTsRank(c.tsRank);
    const tagScore  = jaccard(query.tags, c.affectedSystems);
    return {
      ...c,
      textScore,
      tagScore,
      blendedScore: Wt * textScore + Wg * tagScore,
    };
  });

  ranked.sort((a, b) =>
    b.blendedScore - a.blendedScore ||
    b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return opts.limit && opts.limit > 0 ? ranked.slice(0, opts.limit) : ranked;
};
