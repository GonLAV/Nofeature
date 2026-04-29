import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface WatchData {
  watchers: Array<{ user_id: string; name: string; email: string }>;
  watching: boolean;
  count: number;
}

export default function WatchButton({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<WatchData>({
    queryKey: ['watchers', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/watchers`).then(r => r.data.data),
  });

  const toggle = useMutation({
    mutationFn: () => data?.watching
      ? api.delete(`/incidents/${incidentId}/watch`)
      : api.post(`/incidents/${incidentId}/watch`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchers', incidentId] });
      qc.invalidateQueries({ queryKey: ['watching'] });
      toast.success(data?.watching ? 'Unsubscribed' : 'Watching');
    },
  });

  if (!data) return null;
  const watching = data.watching;

  return (
    <button onClick={() => toggle.mutate()} disabled={toggle.isPending}
      title={data.watchers.map(w => w.name).join(', ') || 'Nobody watching'}
      className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm border ${
        watching ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white hover:bg-gray-50'
      }`}>
      {watching ? <EyeOff size={14}/> : <Eye size={14}/>}
      {watching ? 'Watching' : 'Watch'}
      <span className="text-xs text-gray-400 ml-1">({data.count})</span>
    </button>
  );
}
