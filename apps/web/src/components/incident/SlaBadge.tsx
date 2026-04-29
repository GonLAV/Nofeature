import { useQuery } from '@tanstack/react-query';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api';

interface SlaInfo {
  severity: string;
  ack_target_minutes: number;
  resolve_target_minutes: number;
  ack_elapsed_minutes: number;
  resolve_elapsed_minutes: number;
  ack_breached: boolean;
  resolve_breached: boolean;
  ack_met: boolean;
  resolve_met: boolean;
}

function fmt(min: number) {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}

export default function SlaBadge({ incidentId, onAcknowledge, canAck }: { incidentId: string; onAcknowledge: () => void; canAck: boolean }) {
  const { data } = useQuery<SlaInfo>({
    queryKey: ['sla', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/sla`).then(r => r.data.data),
    refetchInterval: 30_000,
  });
  if (!data) return null;

  const ackPct = Math.min(100, (data.ack_elapsed_minutes / data.ack_target_minutes) * 100);
  const resPct = Math.min(100, (data.resolve_elapsed_minutes / data.resolve_target_minutes) * 100);

  const ackColor = data.ack_breached ? 'bg-red-500' : data.ack_met ? 'bg-green-500' : ackPct > 75 ? 'bg-orange-400' : 'bg-blue-500';
  const resColor = data.resolve_breached ? 'bg-red-500' : data.resolve_met ? 'bg-green-500' : resPct > 75 ? 'bg-orange-400' : 'bg-blue-500';

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2"><Clock size={16}/> SLA</h2>
        {canAck && (
          <button onClick={onAcknowledge}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded">
            Acknowledge
          </button>
        )}
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="flex items-center gap-1">
              {data.ack_breached ? <AlertTriangle size={12} className="text-red-500"/> : data.ack_met ? <CheckCircle2 size={12} className="text-green-500"/> : null}
              Acknowledge {data.ack_met ? '(met)' : data.ack_breached ? '(breached)' : ''}
            </span>
            <span className="text-gray-500">{fmt(data.ack_elapsed_minutes)} / {fmt(data.ack_target_minutes)}</span>
          </div>
          <div className="h-2 rounded bg-gray-100 overflow-hidden">
            <div className={`h-full ${ackColor}`} style={{ width: `${ackPct}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="flex items-center gap-1">
              {data.resolve_breached ? <AlertTriangle size={12} className="text-red-500"/> : data.resolve_met ? <CheckCircle2 size={12} className="text-green-500"/> : null}
              Resolve {data.resolve_met ? '(met)' : data.resolve_breached ? '(breached)' : ''}
            </span>
            <span className="text-gray-500">{fmt(data.resolve_elapsed_minutes)} / {fmt(data.resolve_target_minutes)}</span>
          </div>
          <div className="h-2 rounded bg-gray-100 overflow-hidden">
            <div className={`h-full ${resColor}`} style={{ width: `${resPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
