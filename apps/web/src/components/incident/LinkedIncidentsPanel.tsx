import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Link as LinkIcon, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import toast from 'react-hot-toast';

interface Related {
  parent: { id: string; title: string; severity: string; status: string } | null;
  children: Array<{ id: string; title: string; severity: string; status: string }>;
}

export default function LinkedIncidentsPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data } = useQuery<Related>({
    queryKey: ['related', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/related`).then(r => r.data.data),
  });

  const { data: candidates = [] } = useQuery<Array<{ id: string; title: string; severity: string }>>({
    queryKey: ['incidents-list-for-link'],
    queryFn: () => api.get('/incidents?limit=50').then(r => r.data.data.incidents),
  });

  const filtered = useMemo(
    () => search
      ? candidates.filter(c => c.id !== incidentId && c.title.toLowerCase().includes(search.toLowerCase()))
      : [],
    [candidates, search, incidentId]
  );

  const setParent = useMutation({
    mutationFn: (parent_incident_id: string | null) => api.patch(`/incidents/${incidentId}/parent`, { parent_incident_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['related', incidentId] });
      setSearch('');
      toast.success('Updated');
    },
    onError: () => toast.error('Failed'),
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <LinkIcon size={14}/> Linked Incidents
      </h3>

      {data?.parent ? (
        <div className="flex items-center gap-2 text-sm border rounded p-2 bg-blue-50/50">
          <span className="text-xs text-gray-500">Parent:</span>
          <Link to={`/incidents/${data.parent.id}`} className="text-blue-700 hover:underline truncate">
            [{data.parent.severity}] {data.parent.title}
          </Link>
          <button onClick={() => setParent.mutate(null)} className="ml-auto text-red-500 hover:bg-red-50 p-1 rounded">
            <Trash2 size={12}/>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Search to link as parent…"
            value={search} onChange={e => setSearch(e.target.value)}/>
          {filtered.slice(0, 6).map(c => (
            <button key={c.id} onClick={() => setParent.mutate(c.id)}
              className="w-full text-left text-sm border rounded p-2 hover:bg-gray-50">
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded mr-2">{c.severity}</span>
              {c.title}
            </button>
          ))}
        </div>
      )}

      {data?.children && data.children.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-2">Child incidents ({data.children.length})</div>
          <div className="space-y-1">
            {data.children.map(c => (
              <Link key={c.id} to={`/incidents/${c.id}`}
                className="block text-sm border rounded p-2 hover:bg-gray-50">
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded mr-2">{c.severity}</span>
                {c.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
