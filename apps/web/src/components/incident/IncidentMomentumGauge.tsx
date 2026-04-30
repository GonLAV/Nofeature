import { useQuery } from '@tanstack/react-query';
import { Activity, AlertOctagon, Zap, Snowflake, CheckCircle } from 'lucide-react';
import api from '../../lib/api';

/**
 * IncidentMomentumGauge
 * ─────────────────────
 * Live war-room momentum indicator: are we making progress, or stalling?
 *
 * Polls /momentum every 30s, renders a half-circle gauge color-coded by
 * category, and shows a brief reason ("only one responder is active",
 * "no activity for 18 minutes — consider paging IC", etc.).
 *
 * Why this is novel: every other tool counts events. None synthesize
 * them into a single "are we winning?" signal that drops in real time
 * when a room stalls — turning silent stagnation into a visible alarm.
 */
export interface IncidentMomentumGaugeProps {
  incidentId: string;
  status?: string;
}

interface MomentumResponse {
  score: number;
  category: 'charging' | 'steady' | 'stalling' | 'frozen' | 'resolved';
  signals: {
    activity: number;
    diversity: number;
    convergence: number;
    freshness: number;
    minutes_since_last_event: number;
    activity_target_epm: number;
  };
  reason: string;
  is_stalled: boolean;
}

const CATEGORY_STYLE: Record<MomentumResponse['category'], { color: string; ring: string; label: string; Icon: typeof Activity }> = {
  charging: { color: '#16a34a', ring: 'bg-green-50 border-green-300 text-green-800', label: 'Charging', Icon: Zap },
  steady:   { color: '#2563eb', ring: 'bg-blue-50  border-blue-300  text-blue-800',  label: 'Steady',   Icon: Activity },
  stalling: { color: '#d97706', ring: 'bg-amber-50 border-amber-300 text-amber-900', label: 'Stalling', Icon: AlertOctagon },
  frozen:   { color: '#dc2626', ring: 'bg-red-50   border-red-300   text-red-800',   label: 'Frozen',   Icon: Snowflake },
  resolved: { color: '#475569', ring: 'bg-slate-50 border-slate-300 text-slate-700', label: 'Resolved', Icon: CheckCircle },
};

export default function IncidentMomentumGauge({ incidentId, status }: IncidentMomentumGaugeProps) {
  const isClosed = status === 'resolved' || status === 'closed';

  const { data, isLoading, error } = useQuery<MomentumResponse>({
    queryKey: ['incident-momentum', incidentId],
    queryFn: async () => (await api.get(`/incidents/${incidentId}/momentum`)).data.data,
    refetchInterval: isClosed ? false : 30_000,
    staleTime: 25_000,
  });

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-sm font-medium animate-pulse border border-slate-200">
        <Activity className="h-4 w-4" />
        Measuring momentum…
      </div>
    );
  }
  if (error || !data) return null;

  const style = CATEGORY_STYLE[data.category];
  const Icon = style.Icon;
  // Half-circle gauge: arc length proportional to score.
  const r = 18;
  const circumference = Math.PI * r;
  const dash = (data.score / 100) * circumference;

  return (
    <div className={`group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${style.ring} text-sm font-semibold`}>
      {/* Mini half-circle gauge */}
      <svg width="44" height="24" viewBox="0 0 44 24" aria-hidden="true">
        <path d="M 4 22 A 18 18 0 0 1 40 22" fill="none" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M 4 22 A 18 18 0 0 1 40 22"
          fill="none"
          stroke={style.color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
        <text x="22" y="20" textAnchor="middle" fontSize="9" fontWeight="700" fill={style.color}>
          {data.score}
        </text>
      </svg>
      <Icon className="h-4 w-4" />
      <span>{style.label}</span>
      {data.is_stalled && (
        <span className="text-xs font-normal opacity-75">· stalled</span>
      )}

      {/* Tooltip with breakdown */}
      <div className="invisible group-hover:visible absolute z-20 top-full mt-2 left-0 w-80 p-3 rounded-lg bg-white border border-slate-200 shadow-lg text-slate-700 text-xs font-normal">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-slate-900">Momentum · {data.score}/100</span>
          <span className="text-[11px] uppercase tracking-wide" style={{ color: style.color }}>
            {style.label}
          </span>
        </div>
        <div className="text-slate-600 mb-2">{data.reason}</div>
        <SignalBar label="Activity"    value={data.signals.activity}    color={style.color} />
        <SignalBar label="Diversity"   value={data.signals.diversity}   color={style.color} />
        <SignalBar label="Convergence" value={data.signals.convergence} color={style.color} />
        <SignalBar label="Freshness"   value={data.signals.freshness}   color={style.color} />
        <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-500">
          Last event {Math.round(data.signals.minutes_since_last_event)} min ago ·
          target {data.signals.activity_target_epm} events/min
        </div>
      </div>
    </div>
  );
}

function SignalBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color, transition: 'width 400ms ease' }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{Math.round(value)}</span>
    </div>
  );
}
