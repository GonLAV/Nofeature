import { useQuery } from '@tanstack/react-query';
import { BarChart2, Clock, TrendingDown, Repeat, Server } from 'lucide-react';
import api from '../../lib/api';

interface MetricsOverview {
  totals: { total: number; active: number; resolved: number; avg_mttr_min: number | null };
  series: Array<{ day: string; total: string; p1: string; p2: string; p3: string; p4: string }>;
  top_systems: Array<{ system: string; count: string }>;
}
interface RecurringPattern {
  pattern_key: string;
  occurrences: number;
  last_seen: string;
  severities: string[];
  recent_incidents: Array<{ id: string; title: string; created_at: string; severity: string }>;
  avg_mttr_min: number | null;
}

export default function Analytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['incidents-analytics'],
    queryFn: () => api.get('/incidents?limit=100').then(r => r.data.data),
  });

  const { data: metrics } = useQuery<MetricsOverview>({
    queryKey: ['metrics-overview'],
    queryFn: () => api.get('/metrics/overview?days=30').then(r => r.data.data),
  });

  const { data: recurring } = useQuery<RecurringPattern[]>({
    queryKey: ['recurring-patterns'],
    queryFn: () => api.get('/patterns/recurring').then(r => r.data.data),
  });

  const incidents = data?.incidents ?? [];

  const bySeverity = ['P1','P2','P3','P4'].map(s => ({
    severity: s,
    count: incidents.filter((i: { severity: string }) => i.severity === s).length,
  }));

  const resolved = incidents.filter((i: { status: string }) => i.status === 'resolved');
  const avgResolveMs = resolved.length
    ? resolved.reduce((acc: number, i: { created_at: string; resolved_at: string }) => {
        return acc + (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime());
      }, 0) / resolved.length
    : 0;
  const avgResolveHrs = (avgResolveMs / 3_600_000).toFixed(1);

  const maxCount = Math.max(...bySeverity.map(b => b.count), 1);

  if (isLoading) return <div className="p-6 text-gray-400">Loading analytics...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><BarChart2 size={14} /> Total incidents</div>
          <div className="text-3xl font-semibold">{incidents.length}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Clock size={14} /> Avg resolve time</div>
          <div className="text-3xl font-semibold">{avgResolveHrs}h</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><TrendingDown size={14} /> Resolution rate</div>
          <div className="text-3xl font-semibold">
            {incidents.length ? Math.round((resolved.length / incidents.length) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-4">Incidents by Severity</h2>
        <div className="space-y-3">
          {bySeverity.map(({ severity, count }) => (
            <div key={severity} className="flex items-center gap-3">
              <div className="w-8 text-sm font-bold text-gray-600">{severity}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                <div
                  className={`h-full rounded-full flex items-center px-2 text-xs font-medium text-white transition-all ${
                    severity === 'P1' ? 'bg-red-500' :
                    severity === 'P2' ? 'bg-orange-500' :
                    severity === 'P3' ? 'bg-yellow-500' : 'bg-blue-400'
                  }`}
                  style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? '2rem' : '0' }}>
                  {count > 0 && count}
                </div>
              </div>
              <div className="w-8 text-sm text-gray-500 text-right">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 30-day trend */}
      {metrics?.series && metrics.series.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4">Incidents — Last 30 Days</h2>
          <div className="flex items-end gap-1 h-32">
            {metrics.series.map((d) => {
              const max = Math.max(...metrics.series.map(s => parseInt(s.total)), 1);
              const h = (parseInt(d.total) / max) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.total} incidents`}>
                  <div className="w-full bg-blue-500 hover:bg-blue-600 rounded-t" style={{ height: `${h}%`, minHeight: parseInt(d.total) > 0 ? '4px' : '0' }} />
                </div>
              );
            })}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Avg MTTR (30d): {metrics.totals.avg_mttr_min ? `${metrics.totals.avg_mttr_min} min` : 'n/a'}
          </div>
        </div>
      )}

      {/* Top affected systems */}
      {metrics?.top_systems && metrics.top_systems.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Server size={16}/> Top Affected Systems (30d)</h2>
          <div className="space-y-2">
            {metrics.top_systems.map((s) => (
              <div key={s.system} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-gray-700 truncate">{s.system}</span>
                <span className="text-gray-400">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring patterns */}
      {recurring && recurring.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Repeat size={16}/> Recurring Incident Patterns</h2>
          <div className="space-y-3">
            {recurring.map((r) => (
              <div key={r.pattern_key} className="border-l-4 border-amber-400 pl-3 py-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 capitalize">{r.pattern_key.trim()}</span>
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded">{r.occurrences}x</span>
                  {r.severities.map(s => (
                    <span key={s} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">{s}</span>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Avg MTTR: {r.avg_mttr_min ? `${r.avg_mttr_min}m` : 'n/a'} • Latest: {r.recent_incidents[0]?.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent resolved */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-4">Recently Resolved</h2>
        {resolved.length === 0 ? (
          <p className="text-sm text-gray-400">No resolved incidents yet</p>
        ) : (
          <div className="space-y-2">
            {resolved.slice(0, 10).map((i: { id: string; title: string; severity: string; created_at: string; resolved_at: string }) => {
              const durationMs = new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime();
              const durationMins = Math.round(durationMs / 60_000);
              return (
                <div key={i.id} className="flex items-center gap-3 text-sm py-1">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    i.severity === 'P1' ? 'bg-red-100 text-red-700' :
                    i.severity === 'P2' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{i.severity}</span>
                  <span className="flex-1 text-gray-700 truncate">{i.title}</span>
                  <span className="text-gray-400 shrink-0">{durationMins}m</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
