import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkPlus, Trash2, Globe, User, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export interface IncidentFilter {
  search?: string;
  status?: string[];
  severity?: string[];
}

interface SavedFilter {
  id: string;
  name: string;
  query: IncidentFilter;
  is_shared: boolean;
  is_owner: boolean;
  owner_name: string | null;
}

const STATUSES = ['open', 'investigating', 'monitoring', 'resolved', 'closed'];
const SEVERITIES = ['P1', 'P2', 'P3', 'P4'];

const SEV_CLS: Record<string, string> = {
  P1: 'bg-red-100 text-red-800 border-red-200',
  P2: 'bg-orange-100 text-orange-800 border-orange-200',
  P3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  P4: 'bg-blue-100 text-blue-800 border-blue-200',
};

interface Props {
  filter: IncidentFilter;
  onChange: (f: IncidentFilter) => void;
}

export default function SavedFiltersBar({ filter, onChange }: Props) {
  const qc = useQueryClient();
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: filters = [] } = useQuery<SavedFilter[]>({
    queryKey: ['saved-filters'],
    queryFn: () => api.get('/saved-filters').then(r => r.data.data),
  });

  // Detect active saved filter by deep-equal on query
  useEffect(() => {
    const match = filters.find(f => JSON.stringify(f.query) === JSON.stringify(filter));
    setActiveId(match?.id || null);
  }, [filters, filter]);

  const create = useMutation({
    mutationFn: () => api.post('/saved-filters', { name, query: filter, is_shared: shared }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-filters'] });
      setShowSave(false);
      setName('');
      setShared(false);
      toast.success('View saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/saved-filters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-filters'] });
      toast.success('View deleted');
    },
  });

  const toggle = (key: 'status' | 'severity', val: string) => {
    const cur = filter[key] || [];
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
    onChange({ ...filter, [key]: next.length ? next : undefined });
  };

  const hasFilters =
    !!filter.search || (filter.status?.length || 0) > 0 || (filter.severity?.length || 0) > 0;

  return (
    <div className="bg-white rounded-xl border p-3 mb-4 space-y-3">
      {/* Saved view chips */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Bookmark size={12} /> Views:
          </span>
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => onChange(f.query)}
              className={`group inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
                activeId === f.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {f.is_shared ? <Globe size={10} /> : <User size={10} />}
              {f.name}
              {f.is_owner && (
                <Trash2
                  size={11}
                  className="opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete view "${f.name}"?`)) remove.mutate(f.id);
                  }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filter controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={filter.search || ''}
            onChange={(e) => onChange({ ...filter, search: e.target.value || undefined })}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => toggle('status', s)}
              className={`text-[11px] px-2 py-1 rounded border capitalize ${
                filter.status?.includes(s)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => toggle('severity', s)}
              className={`text-[11px] px-2 py-1 rounded border font-mono ${
                filter.severity?.includes(s)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : `${SEV_CLS[s]} hover:opacity-80`
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {hasFilters && (
          <button
            onClick={() => onChange({})}
            className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            title="Clear filters"
          >
            <X size={12} /> Clear
          </button>
        )}
        {hasFilters && !activeId && (
          <button
            onClick={() => setShowSave(true)}
            className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <BookmarkPlus size={12} /> Save view
          </button>
        )}
      </div>

      {showSave && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSave(false)}
        >
          <div
            className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold">Save current view</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="View name"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Share with the team
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSave(false)}
                className="px-3 py-1.5 text-sm border rounded"
              >
                Cancel
              </button>
              <button
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function applyFilter<T extends { title: string; status: string; severity: string; description?: string | null }>(
  list: T[],
  f: IncidentFilter
): T[] {
  return list.filter((i) => {
    if (f.status && f.status.length && !f.status.includes(i.status)) return false;
    if (f.severity && f.severity.length && !f.severity.includes(i.severity)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${i.title} ${i.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
