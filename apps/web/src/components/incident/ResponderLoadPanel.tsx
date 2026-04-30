/**
 * War Room Vitals \u2014 live cognitive-load roster.
 *
 * Drops onto the dashboard sidebar; auto-refreshes every 30s during
 * an active incident. The point is *glanceability*: a commander
 * scanning this should know in under 2 seconds who has bandwidth
 * to take the next page.
 */

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';

interface RosterEntry {
  userId:    string;
  name:      string;
  email:     string;
  score:     number;
  band:      'idle' | 'normal' | 'busy' | 'saturated' | 'overloaded';
  breakdown: {
    severityCounts: { P1: number; P2: number; P3: number; P4: number };
    contributions: {
      severityPressure: number;
      commentVelocity:  number;
      oncallToday:      number;
      breakDeprivation: number;
      weeklyFatigue:    number;
    };
  };
}

const BAND_STYLE: Record<RosterEntry['band'], { bar: string; chip: string; label: string }> = {
  idle:        { bar: 'bg-emerald-400', chip: 'bg-emerald-50  text-emerald-700', label: 'idle' },
  normal:      { bar: 'bg-emerald-500', chip: 'bg-emerald-50  text-emerald-700', label: 'normal' },
  busy:        { bar: 'bg-amber-400',   chip: 'bg-amber-50    text-amber-700',   label: 'busy' },
  saturated:   { bar: 'bg-orange-500',  chip: 'bg-orange-50   text-orange-700',  label: 'saturated' },
  overloaded:  { bar: 'bg-red-500',     chip: 'bg-red-50      text-red-700',     label: 'overloaded' },
};

export default function ResponderLoadPanel() {
  const { data, isLoading, isError } = useQuery<{ roster: RosterEntry[]; count: number }>({
    queryKey: ['responder-load-roster'],
    queryFn:  () => api.get('/load/roster').then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const overloaded = data?.roster.filter((r) => r.band === 'overloaded' || r.band === 'saturated') ?? [];

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-indigo-600" />
        <h3 className="text-sm font-semibold">War Room Vitals</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400">live</span>
      </div>

      {isLoading && <p className="text-xs text-gray-500">Reading vitals…</p>}
      {isError && <p className="text-xs text-red-600">Vitals unavailable.</p>}

      {overloaded.length > 0 && (
        <div className="mb-3 flex items-start gap-2 p-2 rounded bg-red-50 border border-red-100">
          <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-700">
            <span className="font-semibold">{overloaded.length}</span> responder
            {overloaded.length === 1 ? ' is' : 's are'} at saturation. Consider rotating before paging again.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {data?.roster.map((r) => {
          const style = BAND_STYLE[r.band];
          const pct = Math.round(r.score * 100);
          return (
            <div key={r.userId} className="border rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{r.name}</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded ${style.chip}`}>
                  {style.label}
                </span>
                <span className="text-xs font-mono text-gray-500 w-10 text-right">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full ${style.bar} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(['P1', 'P2', 'P3', 'P4'] as const).map((sev) => {
                  const n = r.breakdown.severityCounts[sev];
                  if (!n) return null;
                  return (
                    <span
                      key={sev}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700"
                    >
                      {n}× {sev}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {data && data.roster.length > 0 && (
        <p className="mt-3 text-[11px] text-gray-400">
          Score blends active incidents, comment velocity, on-call time today,
          break deprivation, and weekly fatigue.
        </p>
      )}
    </div>
  );
}
