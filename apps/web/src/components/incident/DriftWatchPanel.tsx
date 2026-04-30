import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Compass, RefreshCw } from 'lucide-react';
import api from '../../lib/api';

interface DriftEventRow {
  id:            string;
  field:         'title' | 'description' | 'severity' | 'affected_systems';
  previousValue: unknown;
  nextValue:     unknown;
  magnitude:     number;
  createdAt:     string;
}

interface DriftSummary {
  schemaVersion: number;
  totalEvents:   number;
  byField:       Record<string, number>;
  rawTotal:      number;
  weightedScore: number;
  driftIndex:    number;
  startedAt:     string | null;
  endedAt:       string | null;
}

const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
const fmtTime = (s: string) => new Date(s).toLocaleString();

const summarise = (v: unknown): string => {
  if (v == null) return '∅';
  if (Array.isArray(v)) return v.length === 0 ? '∅' : v.join(', ');
  return String(v).slice(0, 80);
};

export default function DriftWatchPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();

  const events = useQuery({
    queryKey: ['drift-events', incidentId],
    queryFn: () =>
      api.get<{ data: DriftEventRow[] }>(`/incidents/${incidentId}/drift`).then((r) => r.data.data),
  });

  const stats = useQuery({
    queryKey: ['drift-stats', incidentId],
    queryFn: () =>
      api.get<{ data: DriftSummary }>(`/incidents/${incidentId}/drift/stats`).then((r) => r.data.data),
  });

  const sync = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/drift/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drift-events', incidentId] });
      qc.invalidateQueries({ queryKey: ['drift-stats', incidentId] });
    },
  });

  const s = stats.data;
  const real = (events.data ?? []).filter((e) => e.magnitude > 0);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="text-amber-400" />
          <h2 className="text-lg font-semibold">Drift Watch</h2>
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 disabled:opacity-50"
        >
          <RefreshCw size={12} className={sync.isPending ? 'animate-spin' : ''} /> Sync
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Drift index</div>
          <div className="text-2xl font-bold">{s ? fmtPct(s.driftIndex) : '—'}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Title</div>
          <div className="text-2xl font-bold">{s ? fmtPct(s.byField.title ?? 0) : '—'}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Description</div>
          <div className="text-2xl font-bold">{s ? fmtPct(s.byField.description ?? 0) : '—'}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500">Tags / severity</div>
          <div className="text-2xl font-bold">
            {s
              ? fmtPct((s.byField.affected_systems ?? 0) + (s.byField.severity ?? 0))
              : '—'}
          </div>
        </div>
      </div>

      {real.length === 0 ? (
        <p className="text-sm text-zinc-500">No drift recorded yet — the framing is stable.</p>
      ) : (
        <ul className="space-y-2">
          {real.slice().reverse().map((e) => (
            <li
              key={e.id}
              className="border border-zinc-800 rounded p-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wide text-amber-400">
                  {e.field.replace('_', ' ')}
                </span>
                <span className="text-zinc-500">{fmtTime(e.createdAt)} · Δ {fmtPct(e.magnitude)}</span>
              </div>
              <div className="mt-1 text-zinc-400">
                <div className="line-through opacity-60">{summarise(e.previousValue)}</div>
                <div>{summarise(e.nextValue)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
