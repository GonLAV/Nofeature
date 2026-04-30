import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../lib/api';

interface Reading {
  id:         string;
  incidentId: string;
  readerId:   string;
  confidence: number;
  note:       string | null;
  recordedAt: string;
}

interface Stats {
  schemaVersion:     number;
  count:             number;
  averageConfidence: number;
  finalConfidence:   number | null;
  startedAt:         string | null;
  endedAt:           string | null;
  slopePerMinute:    number;
  inflections: Array<{
    at:             string;
    fromConfidence: number;
    toConfidence:   number;
    drop:           number;
  }>;
}

const fmtPct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleTimeString() : '—');

export default function ConfidenceGradient({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [confidence, setConfidence] = useState(0.5);
  const [note, setNote] = useState('');

  const stats = useQuery({
    queryKey: ['confidence-stats', incidentId],
    queryFn: () =>
      api.get<{ data: Stats }>(`/incidents/${incidentId}/confidence/stats`).then((r) => r.data.data),
  });

  const readings = useQuery({
    queryKey: ['confidence-readings', incidentId],
    queryFn: () =>
      api.get<{ data: Reading[] }>(`/incidents/${incidentId}/confidence`).then((r) => r.data.data),
  });

  const record = useMutation({
    mutationFn: () =>
      api.post(`/incidents/${incidentId}/confidence`, {
        confidence,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['confidence-stats', incidentId] });
      qc.invalidateQueries({ queryKey: ['confidence-readings', incidentId] });
    },
  });

  const s = stats.data;
  const trend = s && s.slopePerMinute > 0 ? <TrendingUp className="text-emerald-400" /> : <TrendingDown className="text-rose-400" />;

  const sparkline = (() => {
    const pts = readings.data ?? [];
    if (pts.length < 2) return null;
    const t0 = new Date(pts[0].recordedAt).getTime();
    const tN = new Date(pts[pts.length - 1].recordedAt).getTime();
    const span = Math.max(1, tN - t0);
    const W = 600;
    const H = 80;
    const path = pts
      .map((p, i) => {
        const x = ((new Date(p.recordedAt).getTime() - t0) / span) * W;
        const y = H - p.confidence * H;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 bg-zinc-950 border border-zinc-800 rounded">
        <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill="rgba(99,102,241,0.18)" />
        <path d={path} stroke="rgb(129,140,248)" strokeWidth={1.5} fill="none" />
      </svg>
    );
  })();

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <Activity className="text-indigo-400" />
        <h2 className="text-lg font-semibold">Confidence Gradient</h2>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Current</div>
          <div className="text-2xl font-bold">{fmtPct(s?.finalConfidence ?? null)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Average</div>
          <div className="text-2xl font-bold">{fmtPct(s?.averageConfidence ?? 0)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Slope / min</div>
          <div className="text-2xl font-bold flex items-center gap-2">
            {s ? `${(s.slopePerMinute * 100).toFixed(1)}%` : '—'} {s ? trend : null}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Inflections</div>
          <div className="text-2xl font-bold">{s?.inflections.length ?? 0}</div>
        </div>
      </div>

      {sparkline}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          record.mutate();
        }}
        className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-2"
      >
        <label className="text-xs text-zinc-400">
          How well do we understand this incident right now? ({Math.round(confidence * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional: what just changed?"
          maxLength={2000}
          className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm"
        />
        <button
          type="submit"
          disabled={record.isPending}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-semibold"
        >
          Record reading
        </button>
      </form>

      {s && s.inflections.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-900 rounded p-3">
          <div className="text-sm font-semibold text-rose-300 mb-1">Confidence drops</div>
          <ul className="text-xs space-y-1">
            {s.inflections.map((i) => (
              <li key={i.at}>
                {fmtTime(i.at)} — fell from {fmtPct(i.fromConfidence)} to {fmtPct(i.toConfidence)} (Δ {fmtPct(i.drop)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {readings.data && readings.data.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer">Raw readings ({readings.data.length})</summary>
          <ul className="mt-2 space-y-1">
            {readings.data.map((r) => (
              <li key={r.id}>
                {fmtTime(r.recordedAt)} — {fmtPct(r.confidence)}
                {r.note ? ` — ${r.note}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
