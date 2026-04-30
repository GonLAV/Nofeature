/**
 * Cognitive Debt Ledger \u2014 service layer.
 */

import db from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  computeBalance,
  ratePerYear,
  summarisePortfolio,
  DEBT_SCHEMA_VERSION,
  type DebtItem,
  type DebtCategory,
  type Severity,
  type PortfolioSummary,
} from './debt.score';

export interface DebtRecord {
  id:                     string;
  incidentId:             string;
  declaredBy:             string | null;
  declaredAt:             Date;
  category:               DebtCategory;
  title:                  string;
  description:            string | null;
  surface:                number;
  principal:              number;
  severityAtDeclaration:  Severity;
  repaidAt:               Date | null;
  repaidBy:               string | null;
  repaymentUrl:           string | null;
  repaymentNote:          string | null;

  // Derived
  accrued:                number;
  total:                  number;
  ratePerYear:            number;
  ageDays:                number;
  capped:                 boolean;
}

interface DebtRow {
  id:                       string;
  incident_id:              string;
  declared_by:              string | null;
  declared_at:              Date;
  category:                 DebtCategory;
  title:                    string;
  description:              string | null;
  surface:                  number;
  principal:                number;
  severity_at_declaration:  Severity;
  repaid_at:                Date | null;
  repaid_by:                string | null;
  repayment_url:            string | null;
  repayment_note:           string | null;
}

const toItem = (r: DebtRow): DebtItem => ({
  principal:             r.principal,
  surface:               r.surface,
  severityAtDeclaration: r.severity_at_declaration,
  category:              r.category,
  declaredAt:            r.declared_at,
  repaidAt:              r.repaid_at,
});

const decorate = (r: DebtRow): DebtRecord => {
  const snap = computeBalance(toItem(r));
  return {
    id:                    r.id,
    incidentId:            r.incident_id,
    declaredBy:            r.declared_by,
    declaredAt:            r.declared_at,
    category:              r.category,
    title:                 r.title,
    description:           r.description,
    surface:               r.surface,
    principal:             r.principal,
    severityAtDeclaration: r.severity_at_declaration,
    repaidAt:              r.repaid_at,
    repaidBy:              r.repaid_by,
    repaymentUrl:          r.repayment_url,
    repaymentNote:         r.repayment_note,
    accrued:               snap.accrued,
    total:                 snap.total,
    ratePerYear:           snap.ratePerYear,
    ageDays:               snap.ageDays,
    capped:                snap.capped,
  };
};

export class DebtService {
  async declare(opts: {
    tenantId:    string;
    incidentId:  string;
    declaredBy:  string;
    category:    DebtCategory;
    title:       string;
    description?:string;
    surface:     number;
    principal:   number;
  }): Promise<DebtRecord> {
    const { rows: incRows } = await db.query(
      `SELECT severity FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [opts.incidentId, opts.tenantId],
    );
    if (incRows.length === 0) throw new NotFoundError('Incident not found');
    const severity = (incRows[0] as { severity: Severity }).severity;

    const { rows } = await db.query(
      `INSERT INTO debt_items
         (tenant_id, incident_id, declared_by,
          category, title, description, surface, principal,
          severity_at_declaration, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        opts.tenantId, opts.incidentId, opts.declaredBy,
        opts.category, opts.title, opts.description ?? null,
        opts.surface, opts.principal,
        severity, DEBT_SCHEMA_VERSION,
      ],
    );
    return decorate(rows[0] as DebtRow);
  }

  async repay(opts: {
    tenantId:        string;
    debtId:          string;
    repaidBy:        string;
    repaymentUrl?:   string;
    repaymentNote?:  string;
  }): Promise<DebtRecord> {
    const { rows } = await db.query(
      `UPDATE debt_items
          SET repaid_at      = NOW(),
              repaid_by      = $3,
              repayment_url  = $4,
              repayment_note = $5
        WHERE id = $1 AND tenant_id = $2 AND repaid_at IS NULL
        RETURNING *`,
      [
        opts.debtId, opts.tenantId, opts.repaidBy,
        opts.repaymentUrl ?? null, opts.repaymentNote ?? null,
      ],
    );
    if (rows.length === 0) {
      throw new ValidationError({ debt: ['Debt not found or already repaid'] });
    }
    return decorate(rows[0] as DebtRow);
  }

  async listByIncident(incidentId: string, tenantId: string): Promise<DebtRecord[]> {
    const { rows } = await db.query(
      `SELECT * FROM debt_items
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY declared_at DESC`,
      [incidentId, tenantId],
    );
    return (rows as DebtRow[]).map(decorate);
  }

  async listOpen(tenantId: string, limit = 100): Promise<DebtRecord[]> {
    const safe = Math.min(500, Math.max(1, limit));
    const { rows } = await db.query(
      `SELECT * FROM debt_items
        WHERE tenant_id = $1 AND repaid_at IS NULL
        ORDER BY declared_at ASC
        LIMIT $2`,
      [tenantId, safe],
    );
    return (rows as DebtRow[]).map(decorate);
  }

  async portfolio(tenantId: string): Promise<PortfolioSummary> {
    const { rows } = await db.query(
      `SELECT principal, surface, severity_at_declaration, category, declared_at, repaid_at
         FROM debt_items
        WHERE tenant_id = $1`,
      [tenantId],
    );
    type R = {
      principal: number; surface: number;
      severity_at_declaration: Severity; category: DebtCategory;
      declared_at: Date; repaid_at: Date | null;
    };
    const items: DebtItem[] = (rows as R[]).map((r) => ({
      principal:             r.principal,
      surface:               r.surface,
      severityAtDeclaration: r.severity_at_declaration,
      category:              r.category,
      declaredAt:            r.declared_at,
      repaidAt:              r.repaid_at,
    }));
    return summarisePortfolio(items);
  }

  /** Static helper exposed for tests / introspection. */
  ratePerYear = ratePerYear;
}
