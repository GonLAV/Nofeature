/**
 * Resolution Convergence Index panel.
 *
 * Single number, single diagnosis, single forward ETA.
 * Answers the question every commander silently asks at minute 30:
 *   "Are we actually getting closer, or are we spinning?"
 */

import { useQuery } from '@tanstack/react-query';
import { Target, AlertTriangle, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import api from '../../lib/api';

type Diagnosis = 'converging' | 'holding' | 'stuck' | 'diverging';

interface Convergence {
  incidentId:           string;
  computedAt:           string;
  score:                number;
  diagnosis:            Diagnosis;
  velocityPerMin:       number;
  minutesToResolution:  number | null;
  stuckMinutes:         number;
  components: {
    executionRatio:    number;
    scopeNarrowing:    number;
    decisionStability: number;
    cadenceHealth:     number;
  };
}

const DIAGNOSIS_META: Record<Diagnosis, { label: string; tone: string; bg: string }> = {
  converging: { label: 'Converging', tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  holding:    { label: 'Holding',    tone: 'text-gray-700',    bg: 'bg-gray-50 border-gray-200' },
  stuck:      { label: 'Stuck',      tone: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200' },
  diverging:  { label: 'Diverging',  tone: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function ConvergencePanel({ incidentId }: { incidentId: string }) {
  const { data, isLoading, isError } = useQuery<Convergence>({
    queryKey: ['convergence', incidentId],
    queryFn:  () => api.get(`/incidents/${incidentId}/convergence`).then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-indigo-600" />
        <h3 className="text-sm font-semibold">Resolution Convergence</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400">
          progress, not activity
        </span>
      </div>

      {isLoading && <p className="text-xs text-gray-500">Reading the war-room…</p>}
      {isError && <p className="text-xs text-red-600">Convergence unavailable.</p>}

      {data && (
        <>
          <div className={`rounded-lg border p-3 mb-3 ${DIAGNOSIS_META[data.diagnosis].bg}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {data.diagnosis === 'stuck' && <AlertTriangle size={16} className="text-rose-600" />}
                {data.diagnosis === 'converging' && <TrendingUp size={16} className="text-emerald-600" />}
                {data.diagnosis === 'diverging' && <TrendingDown size={16} className="text-amber-600" />}
                {data.diagnosis === 'holding' && <Activity size={16} className="text-gray-600" />}
                <span className={`text-xs font-semibold uppercase tracking-wider ${DIAGNOSIS_META[data.diagnosis].tone}`}>
                  {DIAGNOSIS_META[data.diagnosis].label}
                </span>
              </div>
              <span className="text-2xl font-mono font-semibold text-gray-900">{pct(data.score)}</span>
            </div>

            <div className="h-2 bg-white/60 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all ${
                  data.score >= 0.7 ? 'bg-emerald-500' :
                  data.score >= 0.4 ? 'bg-amber-500'   :
                                      'bg-rose-600'
                }`}
                style={{ width: `${Math.round(data.score * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-gray-600">
                {data.velocityPerMin >= 0 ? '+' : ''}
                {(data.velocityPerMin * 100).toFixed(2)} pp / min
              </span>
              {data.minutesToResolution !== null ? (
                <span className="font-mono text-emerald-700">resolution in ~{data.minutesToResolution} min</span>
              ) : data.diagnosis === 'stuck' ? (
                <span className="font-mono text-rose-700">stuck for {data.stuckMinutes} min</span>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            <Driver label="action"     value={data.components.executionRatio} />
            <Driver label="narrowing"  value={data.components.scopeNarrowing} />
            <Driver label="stability"  value={data.components.decisionStability} />
            <Driver label="cadence"    value={data.components.cadenceHealth} />
          </div>

          {data.diagnosis === 'stuck' && (
            <p className="mt-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              Team has been spinning for {data.stuckMinutes} min. Consider: rotating commander,
              forcing a hypothesis prune, or escalating the question to a peer team.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Driver({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-10 w-full bg-gray-100 rounded relative overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 bg-indigo-500 transition-all"
          style={{ height: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="mt-1 text-[10px] text-gray-500">{label}</span>
    </div>
  );
}
