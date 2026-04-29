import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, X, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router-dom';
import api from '../../lib/api';

interface IncidentLink {
  id: string;
  relation: 'related' | 'duplicate' | 'caused-by' | 'blocks';
  direction: 'incoming' | 'outgoing';
  other_id: string;
  other_title: string;
  other_severity: string;
  other_status: string;
  other_number?: number | null;
  created_at: string;
  created_by_name?: string | null;
}

const RELATIONS = [
  { value: 'related',   label: 'Related to',   color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  { value: 'duplicate', label: 'Duplicate of', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'caused-by', label: 'Caused by',    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'blocks',    label: 'Blocks',       color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
];

const SEV_COLOR: Record<string, string> = {
  P1: 'text-red-600 dark:text-red-400',
  P2: 'text-orange-600 dark:text-orange-400',
  P3: 'text-yellow-600 dark:text-yellow-400',
  P4: 'text-blue-600 dark:text-blue-400',
};

const STATUS_COLOR: Record<string, string> = {
  open:          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  investigating: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  monitoring:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  resolved:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  closed:        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

export default function IncidentLinksPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [relation, setRelation] = useState<IncidentLink['relation']>('related');
  const [showSearch, setShowSearch] = useState(false);

  const { data: links = [] } = useQuery<IncidentLink[]>({
    queryKey: ['incident-links', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/links`).then(r => r.data.data),
  });

  const { data: results = [] } = useQuery<any[]>({
    queryKey: ['incident-search-link', search],
    queryFn: () =>
      api.get(`/incidents`, { params: { search, limit: 8 } })
        .then(r => {
          const arr = r.data?.data?.incidents || r.data?.data || [];
          return arr.filter((i: any) => i.id !== incidentId);
        }),
    enabled: showSearch && search.length >= 2,
  });

  const create = useMutation({
    mutationFn: (to_incident_id: string) =>
      api.post(`/incidents/${incidentId}/links`, { to_incident_id, relation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-links', incidentId] });
      setSearch('');
      setShowSearch(false);
      toast.success('Linked');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to link'),
  });

  const remove = useMutation({
    mutationFn: (linkId: string) => api.delete(`/incidents/${incidentId}/links/${linkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-links', incidentId] });
      toast.success('Unlinked');
    },
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Link2 size={16} /> Incident Links
          {links.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">({links.length})</span>
          )}
        </h3>
        <button
          onClick={() => setShowSearch(s => !s)}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus size={12} /> Link
        </button>
      </div>

      {showSearch && (
        <div className="space-y-2 p-3 rounded border border-dashed border-gray-300 dark:border-gray-600">
          <div className="flex gap-2">
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as IncidentLink['relation'])}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {RELATIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search incidents to link..."
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          {search.length >= 2 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No matches</div>
              )}
              {results.map((i: any) => (
                <button
                  key={i.id}
                  onClick={() => create.mutate(i.id)}
                  disabled={create.isPending}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <span className={`font-mono font-semibold ${SEV_COLOR[i.severity] || ''}`}>
                    {i.severity}
                  </span>
                  {i.incident_number != null && (
                    <span className="text-gray-500 dark:text-gray-400">#{i.incident_number}</span>
                  )}
                  <span className="text-gray-900 dark:text-white truncate">{i.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {links.length === 0 ? (
        <div className="text-xs text-gray-500 dark:text-gray-400 italic flex items-center gap-2">
          <AlertCircle size={12} /> No linked incidents.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => {
            const rel = RELATIONS.find(r => r.value === l.relation);
            return (
              <li
                key={l.id}
                className="group flex items-center gap-2 text-xs p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${rel?.color}`}>
                  {l.direction === 'incoming' ? '←' : '→'} {rel?.label}
                </span>
                <span className={`font-mono font-semibold ${SEV_COLOR[l.other_severity] || ''}`}>
                  {l.other_severity}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLOR[l.other_status] || ''}`}>
                  {l.other_status}
                </span>
                <RouterLink
                  to={`/incidents/${l.other_id}`}
                  className="flex-1 truncate text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {l.other_number != null && (
                    <span className="text-gray-500 dark:text-gray-400 mr-1">#{l.other_number}</span>
                  )}
                  {l.other_title}
                </RouterLink>
                <span className="text-gray-400 dark:text-gray-500" title={new Date(l.created_at).toLocaleString()}>
                  {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </span>
                <button
                  onClick={() => {
                    if (confirm('Remove this link?')) remove.mutate(l.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                  title="Unlink"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
