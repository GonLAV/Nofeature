/**
 * Resolution DNA — tokenization + similarity primitives.
 * Pure functions, no I/O. Deterministic. Unit-testable.
 *
 * We avoid LLM/embedding dependencies so the engine works offline,
 * is explainable, and never leaks tenant data to a third party.
 */

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','i','in','is','it','its',
  'of','on','or','that','the','this','to','was','were','will','with','we','you','our','they',
  'their','its','it','but','if','then','than','when','while','so','do','does','did','not','no',
  'yes','can','could','should','would','may','might','must','shall','about','after','before',
  'into','out','up','down','over','under','again','further','here','there','these','those',
  'just','some','such','only','own','same','too','very','also','any','all','most','other',
  'because','during','through','between','against','above','below','off','until','being',
]);

const TOKEN_RE = /[a-z0-9][a-z0-9_-]{1,}/g;

/** Lowercase, strip punctuation, drop stopwords + tokens length < 2, light stem (trailing s/es/ing/ed). */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const lc = text.toLowerCase();
  const raw = lc.match(TOKEN_RE) ?? [];
  const out: string[] = [];
  for (const t of raw) {
    if (STOPWORDS.has(t)) continue;
    if (t.length < 2) continue;
    out.push(stem(t));
  }
  return out;
}

function stem(t: string): string {
  // Conservative suffix stripping; preserves identifiers like "kafka", "k8s".
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ed'))  return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('es'))  return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/** Count token frequencies. */
export function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/**
 * Compute IDF over the full corpus.
 * Standard formula: ln((N + 1) / (df + 1)) + 1, smoothed.
 */
export function buildIdf(corpus: string[][]): Map<string, number> {
  const N = corpus.length;
  const df = new Map<string, number>();
  for (const doc of corpus) {
    const seen = new Set(doc);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  return idf;
}

/** TF-IDF weighted vector keyed by token. */
export function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = termFreq(tokens);
  const vec = new Map<string, number>();
  let sumSq = 0;
  for (const [t, f] of tf) {
    const w = f * (idf.get(t) ?? 1);
    vec.set(t, w);
    sumSq += w * w;
  }
  // L2 normalize so cosine == dot product.
  const norm = Math.sqrt(sumSq) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
}

/** Cosine similarity for two L2-normalized vectors. Range [0, 1]. */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  // Iterate the smaller map for performance.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const w2 = large.get(t);
    if (w2 !== undefined) dot += w * w2;
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * Domain boosters applied on top of cosine. Returns the *final* score in [0, 1].
 *  - +0.10 if severity matches
 *  - +0.15 if any affected_systems overlap
 *  - +0.05 if resolved within last 30 days (recency)
 *  - capped at 1.0
 */
export interface BoostInput {
  cosineScore: number;
  sameSeverity: boolean;
  systemsOverlap: boolean;
  resolvedDaysAgo: number | null;
}

export function applyBoosts(b: BoostInput): number {
  let s = b.cosineScore;
  if (b.sameSeverity) s += 0.10;
  if (b.systemsOverlap) s += 0.15;
  if (b.resolvedDaysAgo !== null && b.resolvedDaysAgo <= 30) s += 0.05;
  return Math.max(0, Math.min(1, s));
}
