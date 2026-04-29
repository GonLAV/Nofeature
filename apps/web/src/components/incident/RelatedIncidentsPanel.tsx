import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Trash2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface RelLink {
  id: string;
  relation: string;
  other_id: string;
  title: string;
  severity: string;
  status: string;
}

const RELATIONS = ['related', 'duplicate', 'caused-by', 'blocks'] as const;

export default function RelatedIncidentsPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [dst, setDst] = useState('');
  const [relation, setRelation] = useState<typeof RELATIONS[number]>('related');

  const { data: links = [] } = useQuery<RelLink[]>({
    queryKey: ['rel-links', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/links`).then(r => r.data.data),
  });

  const add = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/links`, { dst_id: dst.trim(), relation }),
    onSuccess: () => { setDst(''); qc.invalidateQueries({ queryKey: ['rel-links', incidentId] }); toast.success('Linked'); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Link failed'),
  });
  const del = useMutation({
    mutationFn: (linkId: string) => api.delete(`/incidents/${incidentId}/links/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rel-links', incidentId] }),
  });

  return (
    <div className="bg-white rounded-xl border p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Link2 size={16}/> Related Incidents</h2>

      <div className="flex gap-2 flex-wrap">
        <input value={dst} onChange={e => setDst(e.target.value)}
          placeholder="Incident ID (UUID)"
          className="flex-1 min-w-[220px] border rounded px-3 py-1.5 text-sm font-mono"/>
        <select value={relation} onChange={e => setRelation(e.target.value as any)}
          className="border rounded px-2 py-1.5 text-sm">
          {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={() => dst.trim() && add.mutate()} disabled={!dst.trim() || add.isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm rounded flex items-center gap-1">
          <Plus size={14}/> Link
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-400">No linked incidents.</p>
      ) : (
        <ul className="divide-y">
          {links.map(l => (
            <li key={l.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 capitalize">{l.relation}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100">{l.severity}</span>
              <Link to={`/incidents/${l.other_id}`} className="flex-1 truncate text-blue-600 hover:underline">{l.title}</Link>
              <span className="text-xs text-gray-400 capitalize">{l.status}</span>
              <button onClick={() => del.mutate(l.id)} className="text-gray-400 hover:text-red-500">
                <Trash2 size={14}/>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
