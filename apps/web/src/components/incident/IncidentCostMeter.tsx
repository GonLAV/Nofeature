import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';

/**
 * IncidentCostMeter
 * ─────────────────
 * Live, ticking $ amount that quantifies the *real-world* cost of an
 * unresolved incident: responders, customer revenue impact, brand cost,
 * and SLA breach penalties — all per second.
 *
 * Why this is novel: most incident tools tell you what is broken. This
 * tells you what it is *costing right now* — turning every minute of an
 * outage into a number every executive understands.
 */
export interface IncidentCostMeterProps {
  incidentId: string;
  status?: string;
}

interface Breakdown {
  currency: string;
  elapsed_minutes: number;
  responders_billed: number;
  responder_cost: number;
  customer_impact_cost: number;
  brand_cost: number;
  sla_breach_cost: number;
  total: number;
  burn_rate_per_min: number;
  projection: { plus_30_min: number; plus_60_min: number };
  inputs: {
    severity: string;
    is_open: boolean;
    sla_breached: boolean;
    sla_resolve_minutes: number | null;
    revenue_per_hour_usd: number | null;
    hourly_rate_usd: number;
  };
}

export default function IncidentCostMeter({ incidentId, status }: IncidentCostMeterProps) {
  const isClosed = status === 'resolved' || status === 'closed';

  const { data, isLoading, error } = useQuery<Breakdown>({
    queryKey: ['incident-cost', incidentId],
    queryFn: async () => (await api.get(`/incidents/${incidentId}/cost`)).data.data,
    refetchInterval: isClosed ? false : 30_000,
    staleTime: 25_000,
  });

  // Client-side ticker: extrapolate burn between server polls.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!data || !data.inputs.is_open) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data?.inputs.is_open, data?.total]);

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-sm font-medium animate-pulse">
        <DollarSign className="h-4 w-4" />
        Calculating cost…
      </div>
    );
  }
  if (error || !data) return null;

  // Live displayed amount = server total + burn since last poll.
  const liveTotal = data.inputs.is_open
    ? data.total + (data.burn_rate_per_min / 60) * tick
    : data.total;

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: data.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  const fmtFine = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: data.currency || 'USD',
      maximumFractionDigits: 2,
    }).format(n);

  const tone = data.inputs.sla_breached
    ? 'bg-red-50 border-red-300 text-red-800'
    : data.inputs.is_open
    ? 'bg-amber-50 border-amber-300 text-amber-900'
    : 'bg-slate-50 border-slate-300 text-slate-700';

  return (
    <div className={`group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${tone} text-sm font-semibold`}>
      {data.inputs.sla_breached
        ? <AlertTriangle className="h-4 w-4" />
        : <DollarSign className="h-4 w-4" />}
      <span title="Live cost of this incident">
        {fmt(liveTotal)}
      </span>
      {data.inputs.is_open && (
        <span className="text-xs font-normal opacity-75">
          · {fmtFine(data.burn_rate_per_min)}/min
        </span>
      )}

      {/* Tooltip with breakdown */}
      <div className="invisible group-hover:visible absolute z-20 top-full mt-2 left-0 w-72 p-3 rounded-lg bg-white border border-slate-200 shadow-lg text-slate-700 text-xs font-normal">
        <div className="font-semibold text-slate-900 mb-2">
          Cost breakdown · {data.elapsed_minutes} min elapsed
        </div>
        <Row label="Responders" detail={`${data.responders_billed} × $${data.inputs.hourly_rate_usd}/h`} value={fmtFine(data.responder_cost)} />
        <Row label="Customer impact" detail={data.inputs.revenue_per_hour_usd != null ? `${fmtFine(data.inputs.revenue_per_hour_usd)}/h` : 'not set'} value={fmtFine(data.customer_impact_cost)} />
        <Row label="Brand cost" detail={data.inputs.severity} value={fmtFine(data.brand_cost)} />
        {data.sla_breach_cost > 0 && (
          <Row label="SLA breach" detail="penalty" value={fmtFine(data.sla_breach_cost)} highlight />
        )}
        <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between font-semibold text-slate-900">
          <span>Total</span><span>{fmtFine(liveTotal)}</span>
        </div>
        {data.inputs.is_open && (
          <div className="mt-2 flex items-center gap-1 text-amber-700">
            <TrendingUp className="h-3 w-3" />
            <span>Projected: {fmt(data.projection.plus_30_min)} @ +30m · {fmt(data.projection.plus_60_min)} @ +60m</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, detail, value, highlight }: { label: string; detail: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${highlight ? 'text-red-700 font-semibold' : ''}`}>
      <span>
        {label}
        <span className="opacity-60"> · {detail}</span>
      </span>
      <span>{value}</span>
    </div>
  );
}
