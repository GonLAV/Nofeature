/**
 * Blast Radius Forecaster panel.
 *
 * Live forward-looking projection of an incident's customer impact.
 * The card answers the question every exec asks within 60 seconds of
 * being told something broke: "How bad is this about to get?"
 */

import { useQuery } from '@tanstack/react-query';
import { Radar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import api from '../../lib/api';

interface Forecast {
  incidentId:              string;
  computedAt:              string;
  currentRadius:           number;
  growthRatePerMin:        number;
  projectedRadius30min:    number;
  minutesToCustomerImpact: number | null;
  minutesToP1Escalation:   number | null;
  confidence:              number;
  components: {
    severityFloor: number;
    blastWidth:    number;
    velocity:      number;
    panic:         number;
    statusThrash:  number;
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function GrowthIcon({ rate }: { rate: number }) {
  if (rate > 0.005)  return <TrendingUp size={14} className="text-red-500" />;
  if (rate < -0.005) return <TrendingDown size={14} className="text-emerald-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

export default function BlastRadiusPanel({ incidentId }: { incidentId: string }) {
  const { data, isLoading, isError } = useQuery<Forecast>({
    queryKey: ['blast-forecast', incidentId],
    queryFn:  () => api.get(`/incidents/${incidentId}/blast`).then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radar size={16} className="text-rose-600" />
        <h3 className="text-sm font-semibold">Blast Radius Forecast</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400">
          forward-looking
        </span>
      </div>

      {isLoading && <p className="text-xs text-gray-500">Projecting trajectory…</p>}
      {isError && <p className="text-xs text-red-600">Forecast unavailable.</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Metric label="Now"           value={pct(data.currentRadius)}        emphasis />
            <Metric label="In 30 min"     value={pct(data.projectedRadius30min)} emphasis />
            <Metric
              label={<span className="flex items-center gap-1"><GrowthIcon rate={data.growthRatePerMin}/> Growth / min</span>}
              value={`${(data.growthRatePerMin * 100).toFixed(1)} pp`}
            />
            <Metric label="Confidence"    value={pct(data.confidence)} />
          </div>

          <div className="space-y-1.5 mb-3">
            <ETARow label="First customer-visible symptom" eta={data.minutesToCustomerImpact} good={data.minutesToCustomerImpact === null} />
            <ETARow label="P1 escalation threshold"        eta={data.minutesToP1Escalation}   good={data.minutesToP1Escalation   === null} />
          </div>

          <div className="border-t pt-2 mt-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Drivers</p>
            <div className="grid grid-cols-5 gap-1 text-[10px]">
              <Driver label="severity"  value={data.components.severityFloor} />
              <Driver label="breadth"   value={data.components.blastWidth} />
              <Driver label="velocity"  value={data.components.velocity} />
              <Driver label="panic"     value={data.components.panic} />
              <Driver label="thrash"    value={data.components.statusThrash} />
            </div>
          </div>

          <p className="mt-3 text-[11px] text-gray-400">
            Updates every 30s. Calibrated against past incidents in this tenant.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: { label: React.ReactNode; value: string; emphasis?: boolean }) {
  return (
    <div className="border rounded-lg p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 ${emphasis ? 'text-base font-semibold' : 'text-sm'} text-gray-900 font-mono`}>
        {value}
      </div>
    </div>
  );
}

function ETARow({ label, eta, good }: { label: string; eta: number | null; good: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-600">{label}</span>
      {eta === null ? (
        <span className={good ? 'text-emerald-600' : 'text-gray-500'}>
          {good ? 'not on trajectory' : '—'}
        </span>
      ) : (
        <span className="font-mono text-rose-700">~{eta} min</span>
      )}
    </div>
  );
}

function Driver({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-12 w-full bg-gray-100 rounded relative overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 bg-rose-500 transition-all"
          style={{ height: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="mt-1 text-gray-500">{label}</span>
    </div>
  );
}
