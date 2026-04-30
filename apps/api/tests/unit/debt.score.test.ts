import {
  computeBalance,
  ratePerYear,
  summarisePortfolio,
  MAX_MULTIPLIER,
  DEBT_SCHEMA_VERSION,
  type DebtItem,
} from '../../src/modules/debt/debt.score';

const NOW = new Date('2026-04-30T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const item = (over: Partial<DebtItem> = {}): DebtItem => ({
  principal:             5,
  surface:               2,
  severityAtDeclaration: 'P2',
  category:              'monkey_patch',
  declaredAt:            days(30),
  repaidAt:              null,
  ...over,
});

describe('Cognitive Debt scoring', () => {
  it('exports a schema version', () => {
    expect(DEBT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('a brand-new debt has near-zero accrued interest', () => {
    const snap = computeBalance(item({ declaredAt: NOW }), NOW);
    expect(snap.accrued).toBeLessThan(0.001);
    expect(snap.total).toBeCloseTo(snap.principal, 4);
  });

  it('accrued interest grows monotonically with age', () => {
    const a = computeBalance(item({ declaredAt: days(7) }),   NOW).accrued;
    const b = computeBalance(item({ declaredAt: days(60) }),  NOW).accrued;
    const c = computeBalance(item({ declaredAt: days(180) }), NOW).accrued;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('higher severity accrues faster than lower at the same age', () => {
    const p1 = computeBalance(item({ severityAtDeclaration: 'P1' }), NOW).accrued;
    const p4 = computeBalance(item({ severityAtDeclaration: 'P4' }), NOW).accrued;
    expect(p1).toBeGreaterThan(p4);
  });

  it('alert_silenced is the most expensive category at equal terms', () => {
    const silenced = ratePerYear({ category: 'alert_silenced',  surface: 2, severityAtDeclaration: 'P2' });
    const flag     = ratePerYear({ category: 'feature_flag_flipped', surface: 2, severityAtDeclaration: 'P2' });
    expect(silenced).toBeGreaterThan(flag);
  });

  it('larger surface raises the rate', () => {
    const small = ratePerYear({ category: 'monkey_patch', surface: 1, severityAtDeclaration: 'P2' });
    const big   = ratePerYear({ category: 'monkey_patch', surface: 5, severityAtDeclaration: 'P2' });
    expect(big).toBeGreaterThan(small);
  });

  it('accrued interest is capped at MAX_MULTIPLIER * principal', () => {
    const ancient = computeBalance(
      item({ declaredAt: days(365 * 5), severityAtDeclaration: 'P1', surface: 5 }),
      NOW,
    );
    expect(ancient.capped).toBe(true);
    expect(ancient.accrued).toBeLessThanOrEqual(ancient.principal * MAX_MULTIPLIER + 1e-6);
  });

  it('repaid debts have zero accrued interest', () => {
    const snap = computeBalance(
      item({ declaredAt: days(120), repaidAt: days(10) }),
      NOW,
    );
    expect(snap.accrued).toBe(0);
    expect(snap.total).toBe(snap.principal);
  });

  it('summarisePortfolio splits open vs repaid and sums correctly', () => {
    const items = [
      item({ principal: 5, declaredAt: days(30) }),                       // open
      item({ principal: 3, declaredAt: days(90) }),                       // open
      item({ principal: 4, declaredAt: days(120), repaidAt: days(10) }),  // repaid
    ];
    const s = summarisePortfolio(items, NOW);
    expect(s.openCount).toBe(2);
    expect(s.repaidCount).toBe(1);
    expect(s.principalOutstanding).toBeCloseTo(8, 4);
    expect(s.accruedOutstanding).toBeGreaterThan(0);
    expect(s.totalOutstanding).toBeGreaterThan(s.principalOutstanding);
    expect(s.horizonRisk).toBeGreaterThan(0);
    expect(s.byCategory.monkey_patch).toBeGreaterThan(0);
  });

  it('summarisePortfolio reports NaN median when no repayments yet', () => {
    const s = summarisePortfolio([item()], NOW);
    expect(Number.isNaN(s.medianRepaymentDays)).toBe(true);
  });

  it('summarisePortfolio reports correct median repayment days', () => {
    const items: DebtItem[] = [
      item({ declaredAt: days(50), repaidAt: days(40) }),  // 10 days to repay
      item({ declaredAt: days(60), repaidAt: days(40) }),  // 20 days
      item({ declaredAt: days(70), repaidAt: days(40) }),  // 30 days
    ];
    const s = summarisePortfolio(items, NOW);
    expect(s.medianRepaymentDays).toBeCloseTo(20, 4);
  });
});
