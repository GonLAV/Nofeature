import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Timer, AlertOctagon } from 'lucide-react';

interface SlaMetric {
  severity: string;
  target_min: number | null;
  avg_mttr_min: number | null;
  total: number;
  resolved: number;
  breached: number;
  breach_rate: number;
}

interface SlaActive {
  id: string;
  title: string;
  severity: string;
  sla: { target_min: number; elapsed_min: number; breached: boolean; remaining_min: number };
}

export default function SlaWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-status'],
    queryFn: () => api.get('/sla/status').then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return null;
  if (!data) return null;

  const breached = (data.active as SlaActive[]).filter((a) => a.sla.breached);
  const metrics: SlaMetric[] = data.metrics_30d ?? [];

  return (
    <div className="bg-white border rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-gray-900">SLA Status</h3>
        </div>
        {breached.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded">
            <AlertOctagon className="w-3 h-3" /> {breached.length} breached
          </span>
        )}
      </div>

      {breached.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-2 mb-3 space-y-1">
          {breached.slice(0, 3).map((b) => (
            <div key={b.id} className="text-xs text-red-800 flex justify-between">
              <span className="truncate">{b.severity} · {b.title}</span>
              <span className="font-mono">{b.sla.elapsed_min}m / {b.sla.target_min}m</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-xs">
        {(['P1', 'P2', 'P3', 'P4'] as const).map((sev) => {
          const m = metrics.find((x) => x.severity === sev);
          const breachRate = m?.breach_rate ?? 0;
          const color = breachRate > 25 ? 'text-red-700' : breachRate > 10 ? 'text-yellow-700' : 'text-green-700';
          return (
            <div key={sev} className="border rounded p-2 text-center">
              <div className="font-bold text-gray-900">{sev}</div>
              <div className="text-gray-500 text-[10px]">target {m?.target_min ?? '—'}m</div>
              <div className="font-mono text-sm mt-1">{m?.avg_mttr_min ?? '—'}m</div>
              <div className="text-[10px] text-gray-400">avg MTTR</div>
              <div className={`text-[10px] font-semibold mt-1 ${color}`}>{breachRate}% breach</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
