import db from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  budgetMinutes,
  summariseAccount,
  TREASURY_SCHEMA_VERSION,
  type LedgerEntry,
  type LedgerKind,
  type TreasuryAccountView,
} from './treasury.score';

interface AccountRow {
  id:               string;
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
    const { rows } = await db.query(
      `SELECT * FROM treasury_accounts
        WHERE tenant_id = $1
        ORDER BY service_name`,
      [tenantId],
    );
    const accounts = rows as AccountRow[];
    const summaries: AccountSummary[] = [];
    for (const a of accounts) {
      const entries = await this.recentEntries(a.id, 30);
      summaries.push({
        ...a,
        view: summariseAccount({
          budget:  a.budget_minutes,
          balance: a.balance_minutes,
          entries: entries.map((e) => ({
            kind:      e.kind,
            minutes:   e.minutes,
            createdAt: e.created_at,
          })),
        }),
      });
    }
    return summaries;
  }

  async getAccount(tenantId: string, accountId: string): Promise<AccountSummary> {
    const { rows } = await db.query(
      `SELECT * FROM treasury_accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Treasury account not found');
    const a = rows[0] as AccountRow;
    const entries = await this.recentEntries(a.id, 30);
    return {
      ...a,
      view: summariseAccount({
        budget:  a.budget_minutes,
        balance: a.balance_minutes,
        entries: entries.map((e) => ({
          kind:      e.kind,
          minutes:   e.minutes,
          createdAt: e.created_at,
        })),
      }),
    };
  }

  async ledger(tenantId: string, accountId: string, limit = 50): Promise<LedgerRow[]> {
    await this.getAccount(tenantId, accountId); // tenant guard
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

  async withdraw(opts: {
    tenantId:    string;
    accountId:   string;
    actorId:     string;
    minutes:     number;
    incidentId?: string;
    note?:       string;
  }): Promise<AccountSummary> {
    return this.applyTx({ ...opts, kind: 'withdrawal', signedMinutes: -Math.abs(opts.minutes) });
  }

  async deposit(opts: {
    tenantId:    string;
    accountId:   string;
    actorId:     string;
    minutes:     number;
    incidentId?: string;
    note?:       string;
  }): Promise<AccountSummary> {
    return this.applyTx({ ...opts, kind: 'deposit', signedMinutes: Math.abs(opts.minutes) });
  }

  private async applyTx(opts: {
    tenantId:      string;
    accountId:     string;
    actorId:       string;
    kind:          LedgerKind;
    signedMinutes: number;
    incidentId?:   string;
    note?:         string;
  }): Promise<AccountSummary> {
    const account = await this.getAccount(opts.tenantId, opts.accountId);
    const newBalance = Math.max(0, account.balance_minutes + opts.signedMinutes);

    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO treasury_ledger
           (tenant_id, account_id, kind, minutes, incident_id, note, actor_id, schema_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          opts.tenantId, opts.accountId, opts.kind,
          opts.signedMinutes, opts.incidentId ?? null,
          opts.note ?? null, opts.actorId, TREASURY_SCHEMA_VERSION,
        ],
      );
      await db.query(
        `UPDATE treasury_accounts
            SET balance_minutes = $1,
                updated_at      = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [newBalance, opts.accountId, opts.tenantId],
      );
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

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
    const totalBudget  = accounts.reduce((s, a) => s + a.budget_minutes, 0);
    const totalBalance = accounts.reduce((s, a) => s + a.balance_minutes, 0);
    const totalBurn    = accounts.reduce((s, a) => s + a.view.burn, 0);
    const finiteRunways = accounts
      .map((a) => a.view.runway)
      .filter((r) => Number.isFinite(r));
    const worstRunway = finiteRunways.length ? Math.min(...finiteRunways) : null;
    const freezeCount  = accounts.filter((a) => a.view.recommendation === 'freeze').length;
    const cautionCount = accounts.filter((a) => a.view.recommendation === 'caution').length;
    return { accounts, totalBudget, totalBalance, totalBurn, worstRunway, freezeCount, cautionCount };
  }

  private async recentEntries(accountId: string, days: number): Promise<LedgerRow[]> {
    const { rows } = await db.query(
      `SELECT * FROM treasury_ledger
        WHERE account_id = $1
          AND created_at >= NOW() - ($2 || ' days')::interval
        ORDER BY created_at DESC`,
      [accountId, String(days)],
    );
    return rows as LedgerRow[];
  }
}
