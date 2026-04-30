import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Target, Timer, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';

interface InvestigationStats {
  total: number;
  confirmed: number;
  refuted: number;
  open: number;
  hitRate: number;
  meanTimeToFalsifySeconds: number;
  meanHypothesesPerIncident: number;
  openStale: number;
}

const fmtMin = (s: number) => (s <= 0 ? '—' : `${(s / 60).toFixed(1)} min`);
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

export default function Investigations() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['investigation-stats'],
    queryFn: () =>
      api.get<{ data: InvestigationStats }>('/investigations/stats')
        .then((r) => r.data.data),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="text-cyan-400" /> Investigation Quality
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Treats every incident as a scientific investigation. The metrics below tell you how
          quickly your team converges on the right theory and how often you chase ghosts.
        </p>
      </header>

      {isLoading && <p className="text-sm text-zinc-400">Loading…</p>}
      {error && <p className="text-sm text-rose-400">Failed to load investigation stats.</p>}

      {data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card icon={<Target size={16} />} label="Hit rate" value={fmtPct(data.hitRate)}
                  hint={`${data.confirmed} confirmed / ${data.confirmed + data.refuted} settled`} />
            <Card icon={<Timer size={16} />} label="Mean time to falsify"
                  value={fmtMin(data.meanTimeToFalsifySeconds)}
                  hint="how fast you kill bad theories" />
            <Card icon={<FlaskConical size={16} />} label="Hypotheses / incident"
                  value={data.meanHypothesesPerIncident.toFixed(1)} />
            <Card icon={<AlertTriangle size={16} />} label="Stale open"
                  value={String(data.openStale)}
                  hint="open >30 min — needs evidence or settling"
                  emphasise={data.openStale > 0} />
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded p-4 text-sm text-zinc-400">
            <div className="flex justify-between">
              <span>Total hypotheses logged</span><span className="text-zinc-200">{data.total}</span>
            </div>
            <div className="flex justify-between">
              <span>Confirmed</span><span className="text-emerald-400">{data.confirmed}</span>
            </div>
            <div className="flex justify-between">
              <span>Refuted</span><span className="text-rose-400">{data.refuted}</span>
            </div>
            <div className="flex justify-between">
              <span>Currently open</span><span className="text-amber-400">{data.open}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Card(props: {
  icon: React.ReactNode; label: string; value: string;
  hint?: string; emphasise?: boolean;
}) {
  return (
    <div className={`rounded border p-4 ${
      props.emphasise ? 'border-amber-700 bg-amber-950/30' : 'border-zinc-800 bg-zinc-900'
    }`}>
      <div className="text-xs text-zinc-400 flex items-center gap-1.5">
        {props.icon}{props.label}
      </div>
      <div className="text-2xl font-bold mt-1">{props.value}</div>
      {props.hint && <div className="text-xs text-zinc-500 mt-1">{props.hint}</div>}
    </div>
  );
}
