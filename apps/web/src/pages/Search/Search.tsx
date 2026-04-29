import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, Upload, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Result {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  commander_name: string | null;
}
interface Tag { id: string; name: string; color: string }

const SEVS = ['P1','P2','P3','P4'] as const;
const STATUSES = ['open','investigating','resolved','closed'] as const;

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [sevs, setSevs] = useState<string[]>([]);
  const [stats, setStats] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags').then(r => r.data.data),
  });

  const search = useMutation({
    mutationFn: () => api.post('/incidents/search', {
      q: q || undefined,
      severity: sevs.length ? sevs : undefined,
      status: stats.length ? stats : undefined,
      tag_ids: tagIds.length ? tagIds : undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      limit: 200,
    }).then(r => r.data),
    onSuccess: (r: any) => setResults(r.data),
    onError: () => toast.error('Search failed'),
  });

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => {
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvBusy(true);
    try {
      const text = await file.text();
      const r = await api.post('/incidents/import', text, {
        headers: { 'Content-Type': 'text/csv' },
      });
      const d = r.data.data;
      toast.success(`Imported ${d.imported}${d.error_count ? ` (${d.error_count} errors)` : ''}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Import failed');
    } finally {
      setCsvBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><SearchIcon size={20}/> Advanced Search</h1>
        <label className="bg-white border rounded px-3 py-2 text-sm flex items-center gap-1 cursor-pointer hover:bg-gray-50">
          <Upload size={14}/> {csvBusy ? 'Importing…' : 'Import CSV'}
          <input type="file" accept=".csv,text/csv" hidden onChange={handleCsv} disabled={csvBusy}/>
        </label>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or description…"
          className="w-full border rounded px-3 py-2 text-sm"/>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Filter size={11}/> Severity</div>
            <div className="flex gap-1.5">
              {SEVS.map(s => (
                <button key={s} onClick={() => toggle(sevs, s, setSevs)}
                  className={`text-xs px-2 py-1 rounded border ${sevs.includes(s) ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Status</div>
            <div className="flex gap-1.5 flex-wrap">
              {STATUSES.map(s => (
                <button key={s} onClick={() => toggle(stats, s, setStats)}
                  className={`text-xs px-2 py-1 rounded border capitalize ${stats.includes(s) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Tags</div>
            <div className="flex gap-1.5 flex-wrap">
              {tags.map(t => (
                <button key={t.id} onClick={() => toggle(tagIds, t.id, setTagIds)}
                  className="text-xs px-2 py-1 rounded-full text-white opacity-80 hover:opacity-100"
                  style={{ backgroundColor: t.color, outline: tagIds.includes(t.id) ? '2px solid #1d4ed8' : 'none' }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            From
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"/>
          </label>
          <label className="text-xs text-gray-500">
            To
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"/>
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={() => search.mutate()} disabled={search.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm">
            {search.isPending ? 'Searching…' : 'Search'}
          </button>
          <button onClick={() => {
            setQ(''); setSevs([]); setStats([]); setTagIds([]); setFrom(''); setTo(''); setResults(null);
          }} className="border px-4 py-2 rounded text-sm">Reset</button>
        </div>
      </div>

      {results && (
        <div className="bg-white border rounded-xl">
          <div className="px-4 py-2 border-b text-sm text-gray-500">{results.length} result{results.length === 1 ? '' : 's'}</div>
          {results.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No matches.</div>
          ) : (
            <div className="divide-y">
              {results.map(r => (
                <Link key={r.id} to={`/incidents/${r.id}`}
                  className="block px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100">{r.severity}</span>
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-gray-500 capitalize">{r.status}</span>
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-gray-400">
        CSV format: <code>title,description,severity,status</code> (header row required, severity ∈ P1–P4).
      </div>
    </div>
  );
}
