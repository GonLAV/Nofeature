import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScrollText, AlertTriangle, ShieldCheck, ShieldAlert, Clock, RotateCcw } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

interface PromiseRow {
  id:           string;
  incident_id:  string;
  title:        string;
  detail:       string | null;
  owner_id:     string;
  due_date:     string;
  status:       'open' | 'kept' | 'broken' | 'cancelled';
  kept_at:      string | null;
  broken_at:    string | null;
  evidence_url: string | null;
  created_at:   string;
}

interface Summary {
  total: number; open: number; kept: number; broken: number;
  cancelled: number; overdue: number; endangered: number;
  trust: number; flagged: boolean;
}

interface LeaderboardRow {
  ownerId: string;
  ownerName: string | null;
  trust: number;
  kept: number;
  broken: number;
  open: number;
}

interface ViolationRow {
  id: string;
  promiseId: string;
  promiseTitle: string;
  originalIncidentId: string;
  recurrenceIncidentId: string;
  costMinutes: number;
  detectedAt: string;
}

const STATUS_PILL: Record<PromiseRow['status'], string> = {
  open:      'bg-amber-100 text-amber-800',
  kept:      'bg-green-100 text-green-800',
  broken:    'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700',
};

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString();

export default function Promises() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<PromiseRow['status'] | 'all'>('all');

  const summary = useQuery<Summary>({
    queryKey: ['promises', 'summary'],
    queryFn: () => api.get('/promises/summary').then((r) => r.data.data),
    refetchInterval: 30_000,
  });
  const leaderboard = useQuery<LeaderboardRow[]>({
    queryKey: ['promises', 'leaderboard'],
    queryFn: () => api.get('/promises/leaderboard').then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const violations = useQuery<ViolationRow[]>({
    queryKey: ['promises', 'violations'],
    queryFn: () => api.get('/promises/violations').then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const list = useQuery<PromiseRow[]>({
    queryKey: ['promises', 'list', filter],
    queryFn: () => api.get('/promises', {
      params: filter === 'all' ? undefined : { status: filter },
    }).then((r) => r.data.data),
  });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'keep' | 'break' | 'cancel' }) =>
      api.post(`/promises/${id}/${action}`, {}),
    onSuccess: () => {
      toast.success('Updated');
      qc.invalidateQueries({ queryKey: ['promises'] });
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e.response?.data?.error?.message ?? 'Update failed');
    },
  });

  const trustColor = useMemo(() => {
    const t = summary.data?.trust ?? 0.5;
    if (t >= 0.8) return 'text-green-700';
    if (t >= 0.6) return 'text-amber-700';
    return 'text-red-700';
  }, [summary.data?.trust]);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header className="flex items-center gap-3">
        <ScrollText className="text-red-600" />
        <div>
          <h1 className="text-xl font-semibold">Promise Ledger</h1>
          <p className="text-sm text-gray-500">
            Every postmortem action item, tracked. Recurring incidents that share a genome
            with a past one whose promises were broken raise a violation.
          </p>
        </div>
      </header>

      {/* KPI tiles */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Trust score" value={summary.data ? fmtPct(summary.data.trust) : '—'} className={trustColor}>
          {summary.data?.flagged && <span className="text-xs text-red-600">Below floor</span>}
        </Tile>
        <Tile label="Open" value={summary.data?.open ?? 0} icon={<Clock size={16} />} />
        <Tile label="Endangered" value={summary.data?.endangered ?? 0} icon={<AlertTriangle size={16} className="text-amber-600" />} />
        <Tile label="Kept" value={summary.data?.kept ?? 0} icon={<ShieldCheck size={16} className="text-green-600" />} />
        <Tile label="Broken" value={summary.data?.broken ?? 0} icon={<ShieldAlert size={16} className="text-red-600" />} />
      </section>

      {/* Recurrence violations */}
      <section className="bg-white border rounded-lg">
        <header className="px-4 py-3 border-b flex items-center gap-2">
          <RotateCcw size={16} className="text-red-600" />
          <h2 className="font-medium">Recurrence violations</h2>
          <span className="text-xs text-gray-500">
            New incidents that match a past one whose promises were broken
          </span>
        </header>
        {violations.isLoading ? (
          <div className="p-4 text-sm text-gray-500">Loading…</div>
        ) : (violations.data ?? []).length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No recurrences detected. Promises are being kept.</div>
        ) : (
          <ul className="divide-y">
            {violations.data!.map((v) => (
              <li key={v.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="text-red-600 font-medium truncate flex-1">{v.promiseTitle}</span>
                <span className="text-xs text-gray-500">
                  cost ≈ {Math.round(v.costMinutes)} min
                </span>
                <span className="text-xs text-gray-400">{fmtDate(v.detectedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leaderboard */}
      <section className="bg-white border rounded-lg">
        <header className="px-4 py-3 border-b flex items-center gap-2">
          <h2 className="font-medium">Owner trust leaderboard</h2>
          <span className="text-xs text-gray-500">recency-weighted</span>
        </header>
        {(leaderboard.data ?? []).length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No owner history yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Owner</th>
                <th className="px-4 py-2 text-right">Trust</th>
                <th className="px-4 py-2 text-right">Kept</th>
                <th className="px-4 py-2 text-right">Broken</th>
                <th className="px-4 py-2 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.data!.map((r) => (
                <tr key={r.ownerId} className="border-t">
                  <td className="px-4 py-2">{r.ownerName ?? r.ownerId.slice(0, 8)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${
                    r.trust >= 0.8 ? 'text-green-700' :
                    r.trust >= 0.6 ? 'text-amber-700' : 'text-red-700'
                  }`}>{fmtPct(r.trust)}</td>
                  <td className="px-4 py-2 text-right">{r.kept}</td>
                  <td className="px-4 py-2 text-right">{r.broken}</td>
                  <td className="px-4 py-2 text-right">{r.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* List */}
      <section className="bg-white border rounded-lg">
        <header className="px-4 py-3 border-b flex items-center gap-3">
          <h2 className="font-medium flex-1">All promises</h2>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="kept">Kept</option>
            <option value="broken">Broken</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </header>
        {list.isLoading ? (
          <div className="p-4 text-sm text-gray-500">Loading…</div>
        ) : (list.data ?? []).length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No promises yet. Add action items in a postmortem.</div>
        ) : (
          <ul className="divide-y">
            {list.data!.map((p) => (
              <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_PILL[p.status]}`}>{p.status}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  {p.detail && <div className="text-xs text-gray-500 truncate">{p.detail}</div>}
                </div>
                <span className="text-xs text-gray-500 shrink-0">due {fmtDate(p.due_date)}</span>
                {p.status === 'open' && (
                  <div className="flex gap-1">
                    <button
                      className="text-xs px-2 py-1 bg-green-600 text-white rounded disabled:opacity-50"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: p.id, action: 'keep' })}
                    >Keep</button>
                    <button
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded disabled:opacity-50"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: p.id, action: 'break' })}
                    >Break</button>
                    <button
                      className="text-xs px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: p.id, action: 'cancel' })}
                    >Cancel</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, icon, children, className }: {
  label:    string;
  value:    string | number;
  icon?:    React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-3">
      <div className="text-xs text-gray-500 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${className ?? ''}`}>{value}</div>
      {children}
    </div>
  );
}
