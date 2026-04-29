import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';

interface Viewer { user_id: string; email: string; last_seen: number }

export default function PresenceIndicator({ incidentId }: { incidentId: string }) {
  const me = useAuthStore((s) => s.user);

  // heartbeat every 25s
  useEffect(() => {
    if (!incidentId) return;
    const beat = () => api.post(`/presence/incidents/${incidentId}/heartbeat`).catch(() => {});
    beat();
    const t = setInterval(beat, 25_000);
    return () => {
      clearInterval(t);
      api.delete(`/presence/incidents/${incidentId}`).catch(() => {});
    };
  }, [incidentId]);

  const { data: viewers = [] } = useQuery<Viewer[]>({
    queryKey: ['presence', incidentId],
    queryFn: () => api.get(`/presence/incidents/${incidentId}`).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const others = viewers.filter(v => v.user_id !== me?.id);

  return (
    <div className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
      <Eye size={14} className="text-green-600"/>
      <span className="text-xs text-gray-500">In war room:</span>
      <div className="flex -space-x-2">
        {viewers.slice(0, 8).map(v => (
          <div key={v.user_id} title={v.email}
               className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white ${
                 v.user_id === me?.id ? 'bg-blue-200 text-blue-800' : 'bg-green-100 text-green-800'
               }`}>
            {v.email[0]?.toUpperCase()}
          </div>
        ))}
        {viewers.length > 8 && (
          <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center border-2 border-white">
            +{viewers.length - 8}
          </div>
        )}
      </div>
      {others.length > 0 && (
        <span className="text-xs text-gray-500 ml-1">
          {others.length} other{others.length === 1 ? '' : 's'} active
        </span>
      )}
    </div>
  );
}
