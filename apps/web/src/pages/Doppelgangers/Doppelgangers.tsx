import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Search as SearchIcon } from 'lucide-react';
import api from '../../lib/api';

interface RankedDoppelganger {
  id:               string;
  title:            string;
  severity:         string;
  status:           string;
  resolvedAt:       string | null;
  createdAt:        string;
  affectedSystems:  string[];
  textScore:        number;
  tagScore:         number;
  blendedScore:     number;
}

const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

export default function Doppelgangers() {
  const [q, setQ]       = useState('');
  const [tagsRaw, setT] = useState('');

  const search = useMutation({
    mutationFn: () =>
      api.post<{ data: RankedDoppelganger[] }>('/doppelgangers/search', {
        q,
        tags: tagsRaw.split(',').map((t) => t.trim()).filter(Boolean),
        limit: 10,
      }).then((r) => r.data.data),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    search.mutate();
  };

  const results = search.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="text-violet-400" /> Incident Doppelgangers
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Has this happened before? Paste the symptoms and the system recalls past incidents
          that look the same — ranked by full-text relevance plus tag overlap.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3"
      >
        <div>
          <label className="text-xs text-zinc-400">Symptoms</label>
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. checkout requests timing out after deploy, redis evictions spiking"
            className="block mt-1 w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm h-24"
            maxLength={2000}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400">Affected systems (comma-separated tags)</label>
          <input
            value={tagsRaw}
            onChange={(e) => setT(e.target.value)}
            placeholder="api, redis, checkout"
            className="block mt-1 w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm"
            maxLength={500}
          />
        </div>
        <button
          type="submit"
          disabled={search.isPending || q.trim().length < 2}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-semibold flex items-center gap-2"
        >
          <SearchIcon size={14} /> {search.isPending ? 'Searching…' : 'Find doppelgangers'}
        </button>
        {search.error && (
          <p className="text-sm text-rose-400">Search failed. Try simpler wording.</p>
        )}
      </form>

      {search.isSuccess && (
        <section className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500">No matching past incidents found.</p>
          ) : (
            results.map((r) => (
              <a
                key={r.id}
                href={`/incidents/${r.id}`}
                className="block border border-zinc-800 hover:border-zinc-700 rounded p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {r.severity}
                      </span>
                      <span className="truncate">{r.title}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                      <span>{fmtDate(r.createdAt)}</span>
                      <span>{r.status}</span>
                      {r.affectedSystems.length > 0 && (
                        <span className="truncate">
                          {r.affectedSystems.slice(0, 4).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="text-violet-400 font-semibold text-lg">
                      {fmtPct(r.blendedScore)}
                    </div>
                    <div className="text-zinc-500">
                      text {fmtPct(r.textScore)} · tags {fmtPct(r.tagScore)}
                    </div>
                  </div>
                </div>
              </a>
            ))
          )}
        </section>
      )}
    </div>
  );
}
