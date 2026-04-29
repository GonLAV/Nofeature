import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Github, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Link {
  id: string;
  provider: 'jira' | 'linear' | 'github';
  external_id: string;
  external_url: string;
  title: string | null;
  created_at: string;
}

export default function IncidentLinks({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();

  const { data: links = [] } = useQuery<Link[]>({
    queryKey: ['incident-links', incidentId],
    queryFn: () => api.get(`/integrations/incidents/${incidentId}/links`).then(r => r.data.data),
  });

  const pushMut = useMutation({
    mutationFn: (provider: 'jira' | 'linear' | 'github') =>
      api.post(`/integrations/${provider}/incidents/${incidentId}`),
    onSuccess: (_, provider) => {
      qc.invalidateQueries({ queryKey: ['incident-links', incidentId] });
      toast.success(`Created in ${provider}`);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? 'Failed');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident-links', incidentId] }),
  });

  const icon = (p: string) => p === 'github' ? <Github size={14}/> : <ExternalLink size={14}/>;

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <ExternalLink size={16}/> External Tickets
      </h3>

      <div className="flex gap-2 flex-wrap mb-3">
        {(['jira', 'linear', 'github'] as const).map(p => (
          <button key={p} disabled={pushMut.isPending}
            onClick={() => pushMut.mutate(p)}
            className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1 capitalize">
            <Plus size={12}/> Create in {p}
          </button>
        ))}
      </div>

      {links.length === 0 ? (
        <p className="text-xs text-gray-400">No linked tickets yet.</p>
      ) : (
        <div className="space-y-1">
          {links.map(l => (
            <div key={l.id} className="flex items-center gap-2 text-sm py-1">
              <span className="text-gray-500">{icon(l.provider)}</span>
              <span className="text-xs uppercase font-semibold w-12">{l.provider}</span>
              <a href={l.external_url} target="_blank" rel="noreferrer"
                className="flex-1 text-blue-600 hover:underline truncate">
                {l.external_id} {l.title ? `· ${l.title}` : ''}
              </a>
              <button onClick={() => deleteMut.mutate(l.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                <Trash2 size={12}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
