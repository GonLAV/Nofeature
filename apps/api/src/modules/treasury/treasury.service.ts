/**
 * Reliability Treasury \u2014 service layer.
 *
 * Hardening notes:
 *  - applyTx uses db.transaction + SELECT ... FOR UPDATE so concurrent
 *    withdrawals against the same account cannot lose updates.
 *  - The ledger row records the *actual* delta applied (after clamping to
 *    zero) so the ledger always reconciles to balance.
 *  - listAccounts/dashboard fetch ledger entries in one batched query
 *    (no N+1).
 *  - All writes verify tenant ownership; cross-tenant incidentId is
 *    rejected before any FK check runs.
 */

import db from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { PoolClient } from 'pg';
import {
  budgetMinutes,
  summariseAccount,
  TREASURY_SCHEMA_VERSION,
  type LedgerKind,
  type TreasuryAccountView,
} from './treasury.score';

interface AccountRow {
  id:               string;
  tenant_id:        string;
  service_name:     string;
  slo_target:       number;
  window_days:      number;
  budget_minutes:   number;
  balance_minutes:  number;
  created_at:       Date;
  updated_at:       Date;
}

interface LedgerRow {
  id:           string;
  account_id:   string;
  kind:         LedgerKind;
  minutes:      number;
  incident_id:  string | null;
  note:         string | null;
  actor_id:     string | null;
  created_at:   Date;
}

export interface AccountSummary extends AccountRow {
  view: TreasuryAccountView;
}

const BURN_WINDOW_DAYS = 30;

export class TreasuryService {
  async createAccount(opts: {
    tenantId:     string;
    serviceName:  string;
    sloTarget:    number;
    windowDays:   number;
  }): Promise<AccountRow> {
    const budget = budgetMinutes(opts.sloTarget, opts.windowDays);
    try {
      const { rows } = await db.query(
        `INSERT INTO treasury_accounts
           (tenant_id, service_name, slo_target, window_days,
            budget_minutes, balance_minutes, schema_version)
         VALUES ($1,$2,$3,$4,$5,$5,$6)
         RETURNING *`,
        [
          opts.tenantId, opts.serviceName, opts.sloTarget,
          opts.windowDays, budget, TREASURY_SCHEMA_VERSION,
        ],
      );
      logger.info('treasury.account.created', {
        tenantId: opts.tenantId, serviceName: opts.serviceName, budget,
      });
      return rows[0] as AccountRow;
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        throw new ValidationError({ serviceName: ['Account already exists for this service'] });
      }
      throw err;
    }
  }

  async listAccounts(tenantId: string): Promise<AccountSummary[]> {
    const { rows: accountRows } = await db.query(
      `SELECT * FROM treasury_accounts
        WHERE tenant_id = $1
        ORDER BY service_name`,
      [tenantId],
    );
    const accounts = accountRows as AccountRow[];
    if (accounts.length === 0) return [];

    const accountIds = accounts.map((a) => a.id);
    const { rows: ledgerRows } = await db.query(
      `SELECT account_id, kind, minutes, created_at
         FROM treasury_ledger
        WHERE account_id = ANY($1::uuid[])
          AND created_at >= NOW() - make_interval(days => $2::int)
        ORDER BY created_at DESC`,
      [accountIds, BURN_WINDOW_DAYS],
    );
    type SlimEntry = Pick<LedgerRow, 'account_id' | 'kind' | 'minutes' | 'created_at'>;
    const grouped = new Map<string, SlimEntry[]>();
    for (const e of ledgerRows as SlimEntry[]) {
      const arr = grouped.get(e.account_id) ?? [];
      arr.push(e);
      grouped.set(e.account_id, arr);
    }

    return accounts.map((a) => ({
      ...a,
      view: summariseAccount({
        budget:  a.budget_minutes,
        balance: a.balance_minutes,
        entries: (grouped.get(a.id) ?? []).map((e) => ({
          kind:      e.kind,
          minutes:   e.minutes,
          createdAt: e.created_at,
        })),
      }),
    }));
  }

  async getAccount(tenantId: string, accountId: string): Promise<AccountSummary> {
    const { rows } = await db.query(
      `SELECT * FROM treasury_accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Treasury account not found');
    const a = rows[0] as AccountRow;
    const { rows: entries } = await db.query(
      `SELECT kind, minutes, created_at FROM treasury_ledger
        WHERE account_id = $1
          AND created_at >= NOW() - make_interval(days => $2::int)
        ORDER BY created_at DESC`,
      [a.id, BURN_WINDOW_DAYS],
    );
    type SlimEntry = Pick<LedgerRow, 'kind' | 'minutes' | 'created_at'>;
    return {
      ...a,
      view: summariseAccount({
        budget:  a.budget_minutes,
        balance: a.balance_minutes,
        entries: (entries as SlimEntry[]).map((e) => ({
          kind:      e.kind,
          minutes:   e.minutes,
          createdAt: e.created_at,
        })),
      }),
    };
  }

  async ledger(tenantId: string, accountId: string, limit = 50): Promise<LedgerRow[]> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM treasury_accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId],
    );
    if (!rowCount) throw new NotFoundError('Treasury account not found');

    const safe = Math.min(500, Math.max(1, limit));
    const { rows } = await db.query(
      `SELECT * FROM treasury_ledger
        WHERE account_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [accountId, safe],
    );
    return rows as LedgerRow[];
  }

  async withdraw(opts: TxOpts): Promise<AccountSummary> {
    return this.applyTx(opts, 'withdrawal');
  }

  async deposit(opts: TxOpts): Promise<AccountSummary> {
    return this.applyTx(opts, 'deposit');
  }

  /**
   * Atomic balance update.
   *
   *   1. Open a transaction.
   *   2. SELECT FOR UPDATE on the row, scoped to the tenant.
   *   3. Compute the actual delta (clamped so balance never goes negative).
   *   4. UPDATE the balance and INSERT a ledger row recording the *applied* delta.
   *
   * Concurrent transactions block on the row lock and serialize correctly.
   */
  private async applyTx(opts: TxOpts, kind: LedgerKind): Promise<AccountSummary> {
    if (!Number.isFinite(opts.minutes) || opts.minutes <= 0) {
      throw new ValidationError({ minutes: ['Must be a positive number'] });
    }

    if (opts.incidentId) {
      const { rowCount } = await db.query(
        `SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2`,
        [opts.incidentId, opts.tenantId],
      );
      if (!rowCount) {
        throw new ValidationError({ incidentId: ['Incident not found in this tenant'] });
      }
    }

    const desiredDelta = kind === 'withdrawal'
      ? -Math.abs(opts.minutes)
      :  Math.abs(opts.minutes);

    const updated = await db.transaction(async (client: PoolClient) => {
      const { rows } = await client.query<AccountRow>(
        `SELECT * FROM treasury_accounts
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [opts.accountId, opts.tenantId],
      );
      if (rows.length === 0) throw new NotFoundError('Treasury account not found');
      const account = rows[0];

      // Clamp at zero. The ledger records the actual delta applied so it
      // always reconciles to the new balance.
      const newBalance   = Math.max(0, account.balance_minutes + desiredDelta);
      const appliedDelta = newBalance - account.balance_minutes;

      if (appliedDelta === 0) {
        // No-op (e.g. withdrawing from an already-zero balance). Still
        // record the attempt for audit, but with zero minutes.
        logger.warn('treasury.tx.noop', {
          tenantId: opts.tenantId, accountId: opts.accountId, kind,
          requested: desiredDelta,
        });
      }

      await client.query(
        `INSERT INTO treasury_ledger
           (tenant_id, account_id, kind, minutes, incident_id, note, actor_id, schema_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          opts.tenantId, opts.accountId, kind,
          appliedDelta, opts.incidentId ?? null,
          opts.note ?? null, opts.actorId, TREASURY_SCHEMA_VERSION,
        ],
      );
      const { rows: updatedRows } = await client.query<AccountRow>(
        `UPDATE treasury_accounts
            SET balance_minutes = $1,
                updated_at      = NOW()
          WHERE id = $2 AND tenant_id = $3
          RETURNING *`,
        [newBalance, opts.accountId, opts.tenantId],
      );
      return updatedRows[0];
    });

    logger.info('treasury.tx.applied', {
      tenantId: opts.tenantId, accountId: opts.accountId, kind,
      requested: opts.minutes, balance: updated.balance_minutes,
    });

    return this.getAccount(opts.tenantId, opts.accountId);
  }

  async dashboard(tenantId: string): Promise<{
    accounts:     AccountSummary[];
    totalBudget:  number;
    totalBalance: number;
    totalBurn:    number;
    worstRunway:  number | null;
    freezeCount:  number;
    cautionCount: number;
  }> {
    const accounts = await this.listAccounts(tenantId);
    let totalBudget = 0, totalBalance = 0, totalBurn = 0;
    let freezeCount = 0, cautionCount = 0;
    let worstRunway: number | null = null;

    for (const a of accounts) {
      totalBudget  += a.budget_minutes;
      totalBalance += a.balance_minutes;
      totalBurn    += a.view.burn;
      if (a.view.recommendation === 'freeze')  freezeCount++;
      if (a.view.recommendation === 'caution') cautionCount++;
      if (Number.isFinite(a.view.runway)) {
        worstRunway = worstRunway === null ? a.view.runway : Math.min(worstRunway, a.view.runway);
      }
    }

    return { accounts, totalBudget, totalBalance, totalBurn, worstRunway, freezeCount, cautionCount };
  }
}

export interface TxOpts {
  tenantId:    string;
  accountId:   string;
  actorId:     string;
  minutes:     number;
  incidentId?: string;
  note?:       string;
}
