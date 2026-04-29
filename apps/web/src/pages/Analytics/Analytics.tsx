import { useQuery } from '@tanstack/react-query';
import { BarChart2, Clock, TrendingDown } from 'lucide-react';
import api from '../../lib/api';

export default function Analytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['incidents-analytics'],
    queryFn: () => api.get('/incidents?limit=100').then(r => r.data.data),
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
