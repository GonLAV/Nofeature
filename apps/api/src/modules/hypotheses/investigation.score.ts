/**
 * Pure investigation-efficiency math for the Hypothesis Ledger.
 *
 * Given a stream of settled hypotheses across many incidents, compute:
 *   - hitRate:               confirmed / (confirmed + refuted)
 *   - meanTtfSeconds:        mean time from creation -> refutation
 *                            (how fast the team kills bad theories)
 *   - meanHypothesesPerIncident
 *   - openStaleCount:        currently-open hypotheses older than `staleAfterSeconds`
 *
 * Stale detection is parameterised so callers (route layer / tests) can
 * inject `now` deterministically.
 */

export const HYPOTHESIS_SCHEMA_VERSION = 1;

export type HypothesisStatus = 'open' | 'confirmed' | 'refuted';

export interface HypothesisRecord {
  incidentId:  string;
  status:      HypothesisStatus;
  createdAt:   Date;
  settledAt:   Date | null;
}

export interface InvestigationStats {
  total:                     number;
  confirmed:                 number;
  refuted:                   number;
  open:                      number;
  hitRate:                   number;       // 0..1
  meanTimeToFalsifySeconds:  number;       // 0 if none refuted
  meanHypothesesPerIncident: number;       // 0 if no incidents
  openStale:                 number;
}

export const DEFAULT_STALE_AFTER_SECONDS = 30 * 60; // 30 minutes

const safeDelta = (later: Date, earlier: Date): number => {
  const ms = later.getTime() - earlier.getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
};

export const summariseInvestigation = (
  records: HypothesisRecord[],
  opts: { now?: Date; staleAfterSeconds?: number } = {},
): InvestigationStats => {
  const now = opts.now ?? new Date();
  const staleAfter = opts.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;

  let confirmed = 0;
  let refuted   = 0;
  let open      = 0;
  let openStale = 0;
  let ttfSum    = 0;
  let ttfN      = 0;
  const incidents = new Set<string>();

  for (const r of records) {
    incidents.add(r.incidentId);
    if (r.status === 'confirmed') confirmed += 1;
    else if (r.status === 'refuted') {
      refuted += 1;
      if (r.settledAt) {
        const dt = safeDelta(r.settledAt, r.createdAt);
        if (dt > 0) { ttfSum += dt; ttfN += 1; }
      }
    } else {
      open += 1;
      if (safeDelta(now, r.createdAt) >= staleAfter) openStale += 1;
    }
  }

  const settled = confirmed + refuted;
  return {
    total:                     records.length,
    confirmed,
    refuted,
    open,
    hitRate:                   settled === 0 ? 0 : confirmed / settled,
    meanTimeToFalsifySeconds:  ttfN === 0 ? 0 : ttfSum / ttfN,
    meanHypothesesPerIncident: incidents.size === 0 ? 0 : records.length / incidents.size,
    openStale,
  };
};
