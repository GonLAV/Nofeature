import { tokenize, buildIdf, tfidfVector, cosine, applyBoosts } from '../../src/modules/insights/tokenize';

describe('insights/tokenize', () => {
  describe('tokenize()', () => {
    it('lowercases, strips punctuation, drops stopwords', () => {
      // "the" and "is" dropped as stopwords. Identifiers stay verbatim (no rule matches).
      expect(tokenize('The Database is failing!')).toEqual(['database', 'fail']);
    });

    it('returns empty array for null/undefined/empty', () => {
      expect(tokenize(null)).toEqual([]);
      expect(tokenize(undefined)).toEqual([]);
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
    });

    it('preserves identifier-like tokens (kafka, k8s, redis-master)', () => {
      const out = tokenize('Kafka broker on k8s redis-master is failing');
      expect(out).toContain('kafka');
      expect(out).toContain('k8s');
      expect(out).toContain('redis-master');
    });

    it('applies light stemming (-ing, -ed, -es, -s)', () => {
      expect(tokenize('failing failed failures fails')).toEqual(['fail', 'fail', 'failur', 'fail']);
    });

    it('drops 1-char tokens', () => {
      expect(tokenize('a b cc')).toEqual(['cc']);
    });
  });

  describe('buildIdf() + tfidfVector()', () => {
    it('produces L2-normalized vectors', () => {
      const docs = [tokenize('database down'), tokenize('cache miss'), tokenize('database slow')];
      const idf = buildIdf(docs);
      const v = tfidfVector(docs[0], idf);
      const norm = Math.sqrt(Array.from(v.values()).reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('common terms get lower IDF than rare ones', () => {
      const docs = [
        tokenize('database error production'),
        tokenize('database error staging'),
        tokenize('database error region'),
        tokenize('cache eviction kafka'),
      ];
      const idf = buildIdf(docs);
      // "database" appears in 3/4 docs; "cache" in 1/4 — cache should have higher IDF.
      expect((idf.get('cache') ?? 0)).toBeGreaterThan(idf.get('database') ?? 0);
    });
  });

  describe('cosine()', () => {
    it('returns 1 for identical token bags', () => {
      const docs = [tokenize('database down'), tokenize('database down')];
      const idf = buildIdf(docs);
      const v1 = tfidfVector(docs[0], idf);
      const v2 = tfidfVector(docs[1], idf);
      expect(cosine(v1, v2)).toBeCloseTo(1, 5);
    });

    it('returns 0 for fully disjoint vectors', () => {
      const docs = [tokenize('database failure'), tokenize('cache eviction')];
      const idf = buildIdf(docs);
      const v1 = tfidfVector(docs[0], idf);
      const v2 = tfidfVector(docs[1], idf);
      expect(cosine(v1, v2)).toBe(0);
    });

    it('handles empty vectors safely', () => {
      expect(cosine(new Map(), new Map())).toBe(0);
      expect(cosine(new Map([['x', 1]]), new Map())).toBe(0);
    });

    it('is in [0, 1]', () => {
      const docs = [
        tokenize('production database is down across us-east'),
        tokenize('database latency spike in us-east region'),
        tokenize('totally unrelated cache problem'),
      ];
      const idf = buildIdf(docs);
      const target = tfidfVector(docs[0], idf);
      for (const d of docs) {
        const c = cosine(target, tfidfVector(d, idf));
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('applyBoosts()', () => {
    it('caps the final score at 1.0', () => {
      const s = applyBoosts({ cosineScore: 0.95, sameSeverity: true, systemsOverlap: true, resolvedDaysAgo: 5 });
      expect(s).toBeLessThanOrEqual(1);
    });

    it('adds severity boost only when matching', () => {
      const a = applyBoosts({ cosineScore: 0.5, sameSeverity: true, systemsOverlap: false, resolvedDaysAgo: null });
      const b = applyBoosts({ cosineScore: 0.5, sameSeverity: false, systemsOverlap: false, resolvedDaysAgo: null });
      expect(a).toBeCloseTo(0.6, 5);
      expect(b).toBeCloseTo(0.5, 5);
    });

    it('adds recency boost only within 30 days', () => {
      const fresh = applyBoosts({ cosineScore: 0.5, sameSeverity: false, systemsOverlap: false, resolvedDaysAgo: 5 });
      const stale = applyBoosts({ cosineScore: 0.5, sameSeverity: false, systemsOverlap: false, resolvedDaysAgo: 90 });
      expect(fresh).toBeCloseTo(0.55, 5);
      expect(stale).toBeCloseTo(0.5, 5);
    });
  });
});
