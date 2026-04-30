/**
 * Stakeholder Trust Decay panel.
 *
 * Per audience (customers / internal / exec): how long it has been
 * since they heard anything, calibrated to your tenant's own historical
 * cadence, with a forward-looking ETA to trust collapse.
 */

import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Users, Wrench, Briefcase } from 'lucide-react';
import api from '../../lib/api';

type Audience = 'customers' | 'internal' | 'exec';

interface Pulse {
  incidentId:           string;
  audience:             Audience;
  computedAt:           string;
  gapMinutes:           number;
  baselineMinutes:      number;
  trustScore:           number;
  ratio:                number;
  minutesToTrustLoss:   number | null;
}

const AUDIENCE_META: Record<Audience, { label: string; Icon: typeof Users; tone: string }> = {
  customers: { label: 'Customers',   Icon: Users,     tone: 'text-blue-600' },
  internal:  { label: 'Responders',  Icon: Wrench,    tone: 'text-amber-600' },
  exec:      { label: 'Leadership',  Icon: Briefcase, tone: 'text-purple-600' },
};

const fmtMin = (m: number) => (m < 1 ? '<1 min' : `${Math.round(m)} min`);
const pct    = (n: number) => `${Math.round(n * 100)}%`;

export default function TrustDecayPanel({ incidentId }: { incidentId: string }) {
  const { data, isLoading, isError } = useQuery<Pulse[]>({
    queryKey: ['trust-pulse', incidentId],
    queryFn:  () => api.get(`/incidents/${incidentId}/trust`).then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-rose-600" />
        <h3 className="text-sm font-semibold">Stakeholder Trust Pulse</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400">
          forward-looking
        </span>
      </div>

      {isLoading && <p className="text-xs text-gray-500">Reading the room…</p>}
      {isError && <p className="text-xs text-red-600">Trust pulse unavailable.</p>}

      {data && (
        <div className="space-y-2.5">
          {data.map((p) => <Row key={p.audience} pulse={p} />)}
        </div>
      )}

      {data && (
        <p className="mt-3 text-[11px] text-gray-400">
          Calibrated against this tenant's own cadence on past incidents of the same severity.
        </p>
      )}
    </div>
  );
}

function Row({ pulse }: { pulse: Pulse }) {
  const meta = AUDIENCE_META[pulse.audience];
  const trust = pulse.trustScore;
  const barColor =
    trust >= 0.8 ? 'bg-emerald-500' :
    trust >= 0.6 ? 'bg-amber-500'   :
    trust >= 0.4 ? 'bg-orange-500'  :
                   'bg-rose-600';

  return (
    <div className="border rounded-lg p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <meta.Icon size={14} className={meta.tone} />
        <span className="text-xs font-medium">{meta.label}</span>
        <span className="ml-auto text-xs font-mono">{pct(trust)}</span>
      </div>

      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.round(trust * 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>
          silent for <span className="font-mono text-gray-800">{fmtMin(pulse.gapMinutes)}</span>
          {' '}vs baseline <span className="font-mono">{fmtMin(pulse.baselineMinutes)}</span>
        </span>
        <span>
          {pulse.minutesToTrustLoss === null
            ? (trust <= 0.5
                ? <span className="text-rose-700 font-medium">trust lost</span>
                : <span className="text-emerald-700">on track</span>)
            : <span className="text-rose-700">trust collapse in ~{pulse.minutesToTrustLoss} min</span>}
        </span>
      </div>
    </div>
  );
}
