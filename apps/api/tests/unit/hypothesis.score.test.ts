import { scoreHypothesis } from '../../src/modules/hypotheses/hypothesis.score';

const NOW = new Date('2026-04-30T12:00:00Z');
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('hypothesis.score', () => {
  describe('confirmed/refuted sentinels', () => {
    it('confirmed pins to score 999 and label confirmed', () => {
      const r = scoreHypothesis({
        status: 'confirmed', upVotes: 0, downVotes: 0,
        supports: 0, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      expect(r.score).toBe(999);
      expect(r.label).toBe('confirmed');
    });

    it('refuted pins to -999 and label rejected', () => {
      const r = scoreHypothesis({
        status: 'refuted', upVotes: 99, downVotes: 0,
        supports: 99, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      expect(r.score).toBe(-999);
      expect(r.label).toBe('rejected');
    });

    it('superseded behaves like rejected', () => {
      const r = scoreHypothesis({
        status: 'superseded', upVotes: 5, downVotes: 0,
        supports: 5, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      expect(r.label).toBe('rejected');
    });
  });

  describe('investigating — base scoring', () => {
    it('classifies a fresh, popular hypothesis as leading', () => {
      const r = scoreHypothesis({
        status: 'investigating',
        upVotes: 4, downVotes: 0,
        supports: 2, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(2), now: NOW,
      });
      expect(r.label).toBe('leading');
      expect(r.score).toBeGreaterThanOrEqual(3);
    });

    it('contradicts subtract from score', () => {
      const positive = scoreHypothesis({
        status: 'investigating',
        upVotes: 2, downVotes: 0, supports: 2, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      const muddied = scoreHypothesis({
        status: 'investigating',
        upVotes: 2, downVotes: 0, supports: 2, contradicts: 3, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      expect(muddied.score).toBeLessThan(positive.score);
    });

    it('downvotes pull a leading hypothesis back to plausible', () => {
      const r = scoreHypothesis({
        status: 'investigating',
        upVotes: 3, downVotes: 2, supports: 1, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      expect(r.label).toBe('plausible');
    });
  });

  describe('freshness decay', () => {
    it('a stale hypothesis loses score over time', () => {
      const fresh = scoreHypothesis({
        status: 'investigating',
        upVotes: 2, downVotes: 0, supports: 1, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      const stale = scoreHypothesis({
        status: 'investigating',
        upVotes: 2, downVotes: 0, supports: 1, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(60 * 24), now: NOW, // 1 day idle
      });
      expect(stale.score).toBeLessThan(fresh.score);
      expect(stale.hours_idle).toBeCloseTo(24, 0);
    });

    it('hours_idle is non-negative even when lastActivityAt is in the future', () => {
      const r = scoreHypothesis({
        status: 'investigating',
        upVotes: 1, downVotes: 0, supports: 0, contradicts: 0, contextEvidence: 0,
        lastActivityAt: new Date(NOW.getTime() + 60_000), now: NOW,
      });
      expect(r.hours_idle).toBe(0);
    });
  });

  describe('weak hypotheses', () => {
    it('a freshly posted, unscored hypothesis is plausible (gets the benefit of the doubt)', () => {
      const r = scoreHypothesis({
        status: 'investigating',
        upVotes: 0, downVotes: 0, supports: 0, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(0), now: NOW,
      });
      expect(r.label).toBe('plausible');
      expect(r.score).toBeGreaterThanOrEqual(1);
    });

    it('a stale, unscored hypothesis decays into weak band', () => {
      const r = scoreHypothesis({
        status: 'investigating',
        upVotes: 0, downVotes: 0, supports: 0, contradicts: 0, contextEvidence: 0,
        lastActivityAt: minAgo(60 * 8), now: NOW, // 8h idle, past half-life
      });
      expect(r.label).toBe('weak');
    });

    it('heavily contradicted hypothesis labels as rejected', () => {
      const r = scoreHypothesis({
        status: 'investigating',
        upVotes: 0, downVotes: 1, supports: 0, contradicts: 5, contextEvidence: 0,
        lastActivityAt: minAgo(60 * 24), now: NOW,
      });
      expect(r.label).toBe('rejected');
    });
  });
});
