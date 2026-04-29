import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, XCircle, Clock, Zap, Radio } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  affected_systems: string[];
  created_at: string;
  resolved_at?: string;
}

interface StatusData {
  organization: { name: string; slug: string };
  overall: 'operational' | 'degraded' | 'outage';
  activeIncidents: Incident[];
  recentIncidents: Incident[];
  updatedAt: string;
}

const OVERALL_META = {
  operational: {
    label: 'All systems operational',
    bg: 'from-emerald-500 to-teal-600',
    Icon: CheckCircle,
    pulse: 'bg-emerald-400',
  },
  degraded: {
    label: 'Partial system degradation',
    bg: 'from-amber-400 to-orange-500',
    Icon: AlertTriangle,
    pulse: 'bg-amber-400',
  },
  outage: {
    label: 'Major outage in progress',
    bg: 'from-red-500 to-rose-700',
    Icon: XCircle,
    pulse: 'bg-red-400',
  },
};

const SEV_COLORS: Record<string, string> = {
  P1: 'bg-red-100 text-red-700 border-red-200',
  P2: 'bg-orange-100 text-orange-700 border-orange-200',
  P3: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  P4: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
  open:          'text-red-600',
  investigating: 'text-amber-600',
  resolved:      'text-emerald-600',
  closed:        'text-gray-500',
};

function IncidentCard({ incident, resolved = false }: { incident: Incident; resolved?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${resolved ? 'bg-gray-50/60 opacity-80' : 'bg-white shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEV_COLORS[incident.severity] ?? 'bg-gray-100 text-gray-600'}`}>
              {incident.severity}
            </span>
            <span className={`text-xs font-medium capitalize ${STATUS_COLORS[incident.status] ?? 'text-gray-500'}`}>
              ● {incident.status}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900">{incident.title}</h3>
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0 mt-1">
          {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
        </span>
      </div>

      {incident.affected_systems?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {incident.affected_systems.map(s => (
            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {s}
            </span>
          ))}
        </div>
      )}

      {incident.resolved_at && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle size={12} />
          Resolved {formatDistanceToNow(new Date(incident.resolved_at), { addSuffix: true })}
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError, error } = useQuery<StatusData>({
    queryKey: ['status', slug],
    queryFn: () =>
      fetch(`/api/v1/public/status/${slug}`)
        .then(r => r.json())
        .then(j => {
          if (!j.success) throw new Error(j.error ?? 'Not found');
          return j.data;
        }),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white/60 flex items-center gap-2">
          <Radio size={16} className="animate-pulse" /> Loading status…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <XCircle size={40} className="text-red-400 mx-auto" />
          <p className="text-white font-medium">Status page not found</p>
          <p className="text-white/50 text-sm">{(error as Error)?.message}</p>
        </div>
      </div>
    );
  }

  const { organization, overall, activeIncidents, recentIncidents, updatedAt } = data;
  const meta = OVERALL_META[overall];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      {/* Hero status banner */}
      <div className={`bg-gradient-to-r ${meta.bg} text-white`}>
        <div className="max-w-3xl mx-auto px-6 py-14 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-white/80 text-sm mb-2">
            <Zap size={14} />
            <span className="font-semibold">{organization.name}</span>
            <span>·</span>
            <span>Status</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            {/* Live pulse dot */}
            <span className="relative flex h-4 w-4">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${meta.pulse} opacity-60`} />
              <span className={`relative inline-flex rounded-full h-4 w-4 ${meta.pulse}`} />
            </span>
            <h1 className="text-3xl font-bold">{meta.label}</h1>
          </div>

          <p className="text-white/60 text-sm">
            Last updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Active incidents */}
        {activeIncidents.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <h2 className="text-white font-semibold">Active incidents</h2>
              <span className="ml-auto text-xs text-white/40">{activeIncidents.length} ongoing</span>
            </div>
            <div className="space-y-3">
              {activeIncidents.map(i => <IncidentCard key={i.id} incident={i} />)}
            </div>
          </section>
        )}

        {/* All clear */}
        {activeIncidents.length === 0 && (
          <section>
            <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-8 text-center space-y-3">
              <CheckCircle size={36} className="text-emerald-400 mx-auto" />
              <p className="text-white font-medium">No active incidents</p>
              <p className="text-white/40 text-sm">All systems are running normally</p>
            </div>
          </section>
        )}

        {/* System tiles */}
        <section className="space-y-3">
          <h2 className="text-white font-semibold">System status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              'API', 'Web App', 'Database', 'Notifications', 'AI Analysis', 'Auth',
            ].map(system => {
              const isAffected = activeIncidents.some(
                i => i.affected_systems?.some(s => s.toLowerCase().includes(system.toLowerCase()))
              );
              return (
                <div key={system}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-white/70 text-sm">{system}</span>
                  <span className={`text-xs font-medium ${isAffected ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {isAffected ? 'Degraded' : 'Operational'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent incident history */}
        {recentIncidents.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-white/40" />
              <h2 className="text-white font-semibold">Past 30 days</h2>
            </div>
            <div className="space-y-3">
              {recentIncidents.map(i => <IncidentCard key={i.id} incident={i} resolved />)}
            </div>
          </section>
        )}

        {recentIncidents.length === 0 && (
          <section>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/30 text-sm">
              No incidents in the past 30 days
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-white/20 text-xs pb-6 space-y-1">
          <p>Powered by <span className="text-white/40 font-semibold">War Room AI</span></p>
          <p>{format(new Date(updatedAt), 'PPpp')}</p>
        </footer>
      </div>
    </div>
  );
}
