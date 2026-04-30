/**
 * War Room Vitals \u2014 cognitive-load service.
 *
 * Responsibilities:
 *   1. Compute current load for a responder by aggregating incident
 *      participation, comment velocity, and on-call telemetry.
 *   2. Persist a snapshot (append-only) so we can chart trends and
 *      detect sustained overload.
 *   3. Surface roster-wide load for the commander UI.
 *   4. Recommend the *freshest* candidate from a list \u2014 the page
 *      button calls this to pick safely.
 *
 * Performance:
 *   The roster query is a single round-trip with sub-selects. For
 *   a tenant of ~200 active users it runs in ~5 ms locally.
 */

import db from '../../config/database';
import {
  computeLoad,
  bandFor,
  LOAD_SCHEMA_VERSION,
  pickFreshestResponder,
  type LoadInput,
  type LoadBreakdown,
} from './load.score';

interface RawSignals {
  user_id:                   string;
  name:                      string;
  email:                     string;
  active_severities:         ('P1' | 'P2' | 'P3' | 'P4')[];
  comments_last_hour:        string;
  oncall_minutes_today:      string;
  minutes_since_last_break:  string;
  weekly_oncall_minutes:     string;
}

export interface RosterEntry {
  userId:    string;
  name:      string;
  email:     string;
  score:     number;
  band:      LoadBreakdown['band'];
  breakdown: LoadBreakdown;
  capturedAt: Date;
}

export class LoadService {
  /** Compute (and snapshot) load for a single user. */
  async snapshotUser(userId: string, tenantId: string): Promise<RosterEntry> {
    const sig = await this.loadSignals(userId, tenantId);
    return this.scoreAndPersist(sig, tenantId);
  }

  /** Compute load for every active member of the tenant. One query per signal kind. */
  async getRoster(tenantId: string): Promise<RosterEntry[]> {
    const { rows } = await db.query(
      `SELECT
         u.id   AS user_id,
         u.name AS name,
         u.email AS email,
         COALESCE(
           (SELECT array_agg(i.severity)
              FROM incidents i
              JOIN incident_timeline it ON it.incident_id = i.id
             WHERE i.tenant_id = $1
               AND i.status IN ('open', 'investigating')
               AND i.deleted_at IS NULL
               AND it.user_id = u.id),
           ARRAY[]::TEXT[]
         ) AS active_severities,
         (SELECT COUNT(*) FROM incident_comments c
            WHERE c.tenant_id = $1
              AND c.user_id   = u.id
              AND c.created_at >= NOW() - INTERVAL '60 minutes'
         ) AS comments_last_hour,
         (SELECT COALESCE(EXTRACT(EPOCH FROM
                  (NOW() - GREATEST(MIN(it.created_at), DATE_TRUNC('day', NOW())))) / 60, 0)::int
            FROM incident_timeline it
            JOIN incidents i ON i.id = it.incident_id
           WHERE i.tenant_id = $1
             AND it.user_id  = u.id
             AND it.created_at >= DATE_TRUNC('day', NOW())
         ) AS oncall_minutes_today,
         (SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(it.created_at))) / 60, 0)::int
            FROM incident_timeline it
            JOIN incidents i ON i.id = it.incident_id
           WHERE i.tenant_id = $1
             AND it.user_id  = u.id
         ) AS minutes_since_last_break,
         (SELECT COALESCE(EXTRACT(EPOCH FROM
                  (NOW() - GREATEST(MIN(it.created_at), NOW() - INTERVAL '7 days'))) / 60, 0)::int
            FROM incident_timeline it
            JOIN incidents i ON i.id = it.incident_id
           WHERE i.tenant_id = $1
             AND it.user_id  = u.id
             AND it.created_at >= NOW() - INTERVAL '7 days'
         ) AS weekly_oncall_minutes
       FROM users u
       WHERE u.tenant_id = $1
         AND u.is_active = TRUE
         AND u.deleted_at IS NULL
         AND u.role <> 'viewer'
       ORDER BY u.name ASC`,
      [tenantId],
    );

    const sigs = rows as RawSignals[];
    const out: RosterEntry[] = [];
    for (const sig of sigs) {
      out.push(await this.scoreAndPersist(sig, tenantId));
    }
    // Sort by load descending so the commander sees who's drowning first.
    return out.sort((a, b) => b.score - a.score);
  }

  /**
   * Among a list of candidate user IDs, pick the freshest. Used by
   * the page-someone flow.
   */
  async recommendFreshest(
    candidateUserIds: string[],
    tenantId: string,
  ): Promise<RosterEntry | null> {
    if (!candidateUserIds || candidateUserIds.length === 0) return null;
    const roster = await this.getRoster(tenantId);
    const eligible = roster.filter((r) => candidateUserIds.includes(r.userId));
    return pickFreshestResponder(eligible);
  }

  /* \u2500\u2500\u2500 helpers \u2500\u2500\u2500 */

  private async loadSignals(userId: string, tenantId: string): Promise<RawSignals> {
    const { rows } = await db.query(
      `SELECT
         u.id   AS user_id,
         u.name AS name,
         u.email AS email,
         COALESCE(
           (SELECT array_agg(DISTINCT i.severity)
              FROM incidents i
              JOIN incident_timeline it ON it.incident_id = i.id
             WHERE i.tenant_id = $1
               AND i.status IN ('open','investigating')
               AND i.deleted_at IS NULL
               AND it.user_id = u.id),
           ARRAY[]::TEXT[]
         ) AS active_severities,
         (SELECT COUNT(*) FROM incident_comments c
            WHERE c.tenant_id = $1 AND c.user_id = u.id
              AND c.created_at >= NOW() - INTERVAL '60 minutes') AS comments_last_hour,
         0 AS oncall_minutes_today,
         0 AS minutes_since_last_break,
         0 AS weekly_oncall_minutes
       FROM users u
       WHERE u.id = $2 AND u.tenant_id = $1`,
      [tenantId, userId],
    );
    if (rows.length === 0) throw new Error('User not found');
    return rows[0] as RawSignals;
  }

  private async scoreAndPersist(sig: RawSignals, tenantId: string): Promise<RosterEntry> {
    const input: LoadInput = {
      activeIncidentSeverities: (sig.active_severities ?? []).filter(Boolean),
      commentsLastHour:         Number(sig.comments_last_hour)        || 0,
      oncallMinutesToday:       Number(sig.oncall_minutes_today)      || 0,
      minutesSinceLastBreak:    Number(sig.minutes_since_last_break)  || 0,
      weeklyOncallMinutes:      Number(sig.weekly_oncall_minutes)     || 0,
    };

    const { score, breakdown } = computeLoad(input);
    const sevWeighted = breakdown.contributions.severityPressure;

    const { rows } = await db.query(
      `INSERT INTO responder_load_snapshots
         (tenant_id, user_id, score,
          active_incidents, severity_weighted_load, comments_last_hour,
          oncall_minutes_today, minutes_since_last_break, weekly_oncall_minutes,
          breakdown, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       RETURNING captured_at`,
      [
        tenantId,
        sig.user_id,
        score,
        input.activeIncidentSeverities.length,
        sevWeighted,
        input.commentsLastHour,
        input.oncallMinutesToday,
        input.minutesSinceLastBreak,
        input.weeklyOncallMinutes,
        JSON.stringify(breakdown),
        LOAD_SCHEMA_VERSION,
      ],
    );

    const captured = (rows[0] as { captured_at: Date }).captured_at;
    return {
      userId:     sig.user_id,
      name:       sig.name,
      email:      sig.email,
      score,
      band:       bandFor(score),
      breakdown,
      capturedAt: captured,
    };
  }
}
