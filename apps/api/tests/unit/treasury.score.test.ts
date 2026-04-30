import {
  budgetMinutes,
  burnRate,
  runwayDays,
  recommend,
  interestCredit,
  summariseAccount,
  TREASURY_SCHEMA_VERSION,
  CLEAN_WEEK_INTEREST,
  MAX_INTEREST_RATIO,
  type LedgerEntry,
} from '../../src/modules/treasury/treasury.score';

const NOW = new Date('2026-04-30T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('Reliability Treasury scoring', () => {
  it('exports a schema version', () => {
    expect(TREASURY_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('budgetMinutes for 99.9% over 30d is 43.2 minutes', () => {
    expect(budgetMinutes(0.999, 30)).toBeCloseTo(43.2, 4);
  });

  it('budgetMinutes rejects invalid sloTarget', () => {
    expect(() => budgetMinutes(0, 30)).toThrow();
    expect(() => budgetMinutes(1, 30)).toThrow();
    expect(() => budgetMinutes(0.999, 0)).toThrow();
  });

  it('burnRate sums withdrawals over the window', () => {
    const entries: LedgerEntry[] = [
      { kind: 'withdrawal', minutes: -10, createdAt: days(1) },
      { kind: 'withdrawal', minutes: -4,  createdAt: days(3) },
      { kind: 'deposit',    minutes: 2,   createdAt: days(2) },
      { kind: 'withdrawal', minutes: -5,  createdAt: days(20) }, // outside 7d window
    ];
    const rate = burnRate(entries, 7, NOW);
    expect(rate).toBeCloseTo(14 / 7, 4);
  });

  it('runwayDays returns Infinity at zero burn and 0 at zero balance', () => {
    expect(runwayDays(100, 0)).toBe(Infinity);
    expect(runwayDays(0,   5)).toBe(0);
    expect(runwayDays(20,  5)).toBeCloseTo(4, 4);
  });

  it('recommend status transitions through healthy/caution/freeze', () => {
    expect(recommend(100, 1).status).toBe('healthy');   // 100d runway
    expect(recommend(8,   1).status).toBe('caution');   // 8d runway
    expect(recommend(2,   1).status).toBe('freeze');    // 2d runway
    expect(recommend(0,   1).status).toBe('freeze');    // exhausted
  });

  it('interestCredit pays per clean week and is capped', () => {
    expect(interestCredit(100, 0)).toBe(0);
    expect(interestCredit(100, 6)).toBe(0);
    expect(interestCredit(100, 7)).toBeCloseTo(100 * CLEAN_WEEK_INTEREST, 6);
    expect(interestCredit(100, 14)).toBeCloseTo(100 * CLEAN_WEEK_INTEREST * 2, 6);
    // very long clean streak should hit the cap
    const big = interestCredit(100, 365);
    expect(big).toBeLessThanOrEqual(100 * MAX_INTEREST_RATIO + 1e-6);
  });

  it('summariseAccount produces utilization and a recommendation', () => {
    const view = summariseAccount({
      budget:  43.2,
      balance: 30,
      entries: [
        { kind: 'withdrawal', minutes: -7, createdAt: days(1) },
        { kind: 'withdrawal', minutes: -7, createdAt: days(2) },
      ],
      now: NOW,
    });
    expect(view.budget).toBeCloseTo(43.2, 4);
    expect(view.balance).toBeCloseTo(30, 4);
    expect(view.burn).toBeGreaterThan(0);
    expect(view.utilization).toBeGreaterThan(0);
    expect(view.utilization).toBeLessThanOrEqual(1);
    expect(['healthy','caution','freeze']).toContain(view.recommendation);
  });

  it('summariseAccount recommends freeze when balance is exhausted', () => {
    const view = summariseAccount({
      budget:  43.2,
      balance: 0,
      entries: [{ kind: 'withdrawal', minutes: -50, createdAt: days(1) }],
      now: NOW,
    });
    expect(view.recommendation).toBe('freeze');
    expect(view.utilization).toBe(1);
  });
});
