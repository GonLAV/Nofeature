import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dna, Lightbulb, ShieldCheck, ShieldAlert, ShieldQuestion, Sparkles } from 'lucide-react';
import api from '../../lib/api';

interface TaxonomyRow {
  id: string;
  slug: string;
  label: string;
  description: string | null;
}

interface MitigationStats {
  sampleSize: number;
  successRate: number;
  successLowerBound: number;
  mttrLiftSeconds: number;
  recommendation: 'strong' | 'promising' | 'mixed' | 'weak' | 'unknown';
}

interface MemoryEntry {
  mitigation: TaxonomyRow;
  stats: MitigationStats;
}

const recColor: Record<MitigationStats['recommendation'], string> = {
  strong:    'text-emerald-400',
  promising: 'text-lime-400',
  mixed:     'text-amber-400',
  weak:      'text-rose-400',
  unknown:   'text-zinc-500',
};

const recIcon: Record<MitigationStats['recommendation'], React.ReactNode> = {
  strong:    <ShieldCheck size={14} />,
  promising: <ShieldCheck size={14} />,
  mixed:     <ShieldQuestion size={14} />,
  weak:      <ShieldAlert size={14} />,
  unknown:   <ShieldQuestion size={14} />,
};

const fmtMinutes = (s: number) => (s <= 0 ? '—' : `${Math.round(s / 60)} min`);
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

export default function FailureDna() {
  const [slug, setSlug] = useState<string>('');
  const [windowDays, setWindowDays] = useState(365);

  const modesQ = useQuery({
    queryKey: ['dna', 'failure-modes'],
    queryFn: () =>
      api.get<{ data: TaxonomyRow[] }>('/dna/failure-modes').then((r) => r.data.data),
    staleTime: 60_000,
  });

  const memoryQ = useQuery({
    enabled: Boolean(slug),
    queryKey: ['dna', 'memory', slug, windowDays],
    queryFn: () =>
      api.get<{ data: MemoryEntry[] }>(
        `/dna/memory?failureModeSlug=${encodeURIComponent(slug)}&windowDays=${windowDays}`,
      ).then((r) => r.data.data),
    staleTime: 30_000,
  });

  const modes = modesQ.data ?? [];
  const memory = memoryQ.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Dna className="text-fuchsia-400" /> Failure Mode DNA &amp; Mitigation Memory
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          When a known pattern recurs, see exactly which mitigations have actually worked — ranked by Wilson lower bound so small samples can&rsquo;t tell tall tales.
        </p>
      </header>

      <section className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-zinc-400">Failure mode</label>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="block mt-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm w-72"
            >
              <option value="">— select a failure mode —</option>
              {modes.map((m) => (
                <option key={m.id} value={m.slug}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Look-back</label>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="block mt-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm"
            >
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
            </select>
          </div>
        </div>
      </section>

      {slug && (
        <section className="bg-zinc-900 border border-zinc-800 rounded p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="text-amber-400" size={18} />
            What&rsquo;s worked before
          </h2>

          {memoryQ.isLoading && (
            <p className="text-sm text-zinc-400">Loading memory…</p>
          )}

          {!memoryQ.isLoading && memory.length === 0 && (
            <p className="text-sm text-zinc-500">
              No mitigations have been applied to incidents tagged with this pattern yet.
            </p>
          )}

          <div className="space-y-2">
            {memory.map((e) => (
              <div
                key={e.mitigation.id}
                className="flex items-center justify-between border border-zinc-800 rounded p-3 hover:border-zinc-700"
              >
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {e.mitigation.label}
                    <span className={`text-xs flex items-center gap-1 ${recColor[e.stats.recommendation]}`}>
                      {recIcon[e.stats.recommendation]} {e.stats.recommendation}
                    </span>
                  </div>
                  {e.mitigation.description && (
                    <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                      {e.mitigation.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm shrink-0">
                  <Stat label="Sample"   value={`n=${e.stats.sampleSize}`} />
                  <Stat label="Success"  value={fmtPct(e.stats.successRate)} />
                  <Stat label="Wilson 95%" value={fmtPct(e.stats.successLowerBound)}
                        className={recColor[e.stats.recommendation]} />
                  <Stat label="MTTR lift" value={fmtMinutes(e.stats.mttrLiftSeconds)}
                        icon={<Sparkles size={12} className="text-emerald-400" />} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: string; className?: string; icon?: React.ReactNode }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{props.label}</div>
      <div className={`font-semibold flex items-center gap-1 justify-end ${props.className ?? ''}`}>
        {props.icon}{props.value}
      </div>
    </div>
  );
}
