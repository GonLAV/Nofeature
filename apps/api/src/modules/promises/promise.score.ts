/**
 * Postmortem Promise Ledger \u2014 pure scoring logic.
 *
 * The trust score is a recency-weighted ratio of kept vs broken
 * promises. Recent breaks hurt much more than ancient ones, and an
 * empty history is treated as neutral (0.5) rather than perfect.
 *
 * All exports here are pure functions \u2014 no DB access, no I/O \u2014 so they
 * are trivially unit-testable.
 */

export const PROMISE_SCHEMA_VERSION = 1;

/** Promises older than this no longer affect the trust score. */
export const TRUST_HALF_LIFE_DAYS = 90;
/** Open promises past this many days overdue count as "endangered". */
export const ENDANGERED_OVERDUE_DAYS = 7;
/** Threshold below which a team's trust is flagged. */
export const TRUST_FLOOR = 0.6;

export type PromiseStatus = 'open' | 'kept' | 'broken' | 'cancelled';

export interface PromiseRecord {
  status:    PromiseStatus;
  /** Time the promise was resolved (kept_at or broken_at), if any. */
  resolvedAt?: Date | null;
  /** Date the promise was due. Used for overdue calculations on open ones. */
  dueDate:   Date;
}

/**
 * Time-decay weight in [0,1] for a resolution that happened \`ageDays\`
 * ago. Uses the standard half-life formula with TRUST_HALF_LIFE_DAYS.
 */
export function recencyWeight(ageDays: number, halfLife = TRUST_HALF_LIFE_DAYS): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  if (halfLife <= 0) return 0;
  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * Recency-weighted trust score in [0,1]. Empty history returns 0.5.
 *
 * Cancelled promises and still-open promises are excluded \u2014 only
 * resolved (kept|broken) ones move the score.
 */
export function trustScore(promises: PromiseRecord[], now = new Date()): number {
  let kept = 0;
  let broken = 0;
  for (const p of promises) {
    if (p.status !== 'kept' && p.status !== 'broken') continue;
    if (!p.resolvedAt) continue;
    const ageDays = (now.getTime() - p.resolvedAt.getTime()) / (1000 * 60 * 60 * 24);
    const w = recencyWeight(ageDays);
    if (p.status === 'kept') kept += w;
    else broken += w;
  }
  const total = kept + broken;
  if (total === 0) return 0.5;
  return kept / total;
}

/**
 * Days a promise is overdue. 0 if not overdue or already resolved.
 */
export function overdueDays(p: PromiseRecord, now = new Date()): number {
  if (p.status !== 'open') return 0;
  const diffMs = now.getTime() - p.dueDate.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / (1000 * 60 * 60 * 24);
}

export interface LedgerSummary {
  total:       number;
  open:        number;
  kept:        number;
  broken:      number;
  cancelled:   number;
  overdue:     number;
  endangered:  number;
  trust:       number;
  flagged:     boolean;
}

export function summarise(promises: PromiseRecord[], now = new Date()): LedgerSummary {
  const summary: LedgerSummary = {
    total: promises.length, open: 0, kept: 0, broken: 0, cancelled: 0,
    overdue: 0, endangered: 0, trust: 0, flagged: false,
  };
  for (const p of promises) {
    summary[p.status]++;
    if (p.status === 'open') {
      const od = overdueDays(p, now);
      if (od > 0) summary.overdue++;
      if (od >= ENDANGERED_OVERDUE_DAYS) summary.endangered++;
    }
  }
  summary.trust   = trustScore(promises, now);
  summary.flagged = summary.trust < TRUST_FLOOR && summary.kept + summary.broken > 0;
  return summary;
}
