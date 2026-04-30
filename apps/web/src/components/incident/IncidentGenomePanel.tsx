/**
 * Incident Genome panel.
 *
 * Surfaces the top-K most genetically similar past incidents \u2014
 * matching on RESPONSE SHAPE (severity, mobilisation speed, comment
 * density, blast radius), not just title or service.
 *
 * The "why these match" chips are the killer detail: they show the
 * top 3 dimensions that pushed the cosine similarity up, so an
 * on-call engineer instantly understands *why* the system surfaced
 * each one.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Dna, Loader2 } from 'lucide-react';
import api from '../../lib/api';

const FEATURE_LABELS: Record<number, string> = {
  0: 'severity',
  1: 'duration',
  2: 'blast radius',
  3: 'service count',
  4: 'team size',
  5: 'comment density',
  6: 'event density',
  7: 'mobilisation speed',
  8: 'status thrash',
  9: 'tag count',
};

interface Match {
  incidentId: string;
  title: string;
  severity: string;
  status: string;
  resolvedAt: string | null;
  similarity: number;
  contributions: { dim: number; contribution: number }[];
}

const SEV_COLOR: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-yellow-100 text-yellow-700',
  P4: 'bg-gray-100 text-gray-600',
};

const STATUS_COLOR: Record<string, string> = {
  open:          'bg-red-50 text-red-700',
  investigating: 'bg-amber-50 text-amber-700',
  resolved:      'bg-emerald-50 text-emerald-700',
  closed:        'bg-gray-100 text-gray-600',
};

export default function IncidentGenomePanel({ incidentId }: { incidentId: string }) {
  const { data, isLoading, isError } = useQuery<{ matches: Match[]; count: number }>({
    queryKey: ['incident-genome-matches', incidentId],
    queryFn:  () =>
      api.get(`/incidents/${incidentId}/genome/matches?limit=5`).then((r) => r.data.data),
    // Genome generation is mildly expensive on first read; cache for
    // the session and only refetch on explicit invalidation.
    staleTime: 60_000,
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Dna size={16} className="text-fuchsia-600" />
        <h3 className="text-sm font-semibold">Incident Genome</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400">
          response-shape match
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
          <Loader2 size={14} className="animate-spin" />
          Sequencing genome…
        </div>
      )}

      {isError && (
        <p className="text-xs text-red-600">
          Genome service unavailable. The rest of the workspace is unaffected.
        </p>
      )}

      {!isLoading && !isError && data?.matches.length === 0 && (
        <p className="text-xs text-gray-500">
          No close genetic matches yet. The genome will sharpen as more incidents resolve.
        </p>
      )}

      <div className="space-y-2">
        {data?.matches.map((m) => (
          <Link
            key={m.incidentId}
            to={`/incidents/${m.incidentId}`}
            className="block border rounded-lg p-3 hover:bg-fuchsia-50/40 transition"
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  SEV_COLOR[m.severity] ?? 'bg-gray-100'
                }`}
              >
                {m.severity}
              </span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded ${
                  STATUS_COLOR[m.status] ?? 'bg-gray-100'
                }`}
              >
                {m.status}
              </span>
              <span className="ml-auto text-xs font-mono text-fuchsia-700">
                {(m.similarity * 100).toFixed(0)}% match
              </span>
            </div>

            <div className="mt-1.5 text-sm font-medium text-gray-900 line-clamp-1">
              {m.title}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {m.contributions.slice(0, 3).map((c) => (
                <span
                  key={c.dim}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100"
                  title={`contribution ${(c.contribution * 100).toFixed(1)}%`}
                >
                  {FEATURE_LABELS[c.dim] ?? `dim ${c.dim}`}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {data && data.matches.length > 0 && (
        <p className="mt-3 text-[11px] text-gray-400">
          Matches share <span className="font-medium">how the team responded</span>, not
          just what broke.
        </p>
      )}
    </div>
  );
}
