import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, X, Plus } from 'lucide-react';
import api from '../../lib/api';

interface ServiceLink { id: string; name: string; status: string }
interface ServiceOption { id: string; name: string }

const STATUS_DOT: Record<string, string> = {
  operational: 'bg-green-500',
  degraded: 'bg-yellow-500',
  partial_outage: 'bg-orange-500',
  major_outage: 'bg-red-500',
  maintenance: 'bg-blue-500',
};

export default function IncidentServices({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);

  const { data: linked = [] } = useQuery<ServiceLink[]>({
    queryKey: ['incident-services', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/services`).then(r => r.data.data),
  });

  const { data: all = [] } = useQuery<ServiceOption[]>({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
  });

  const add = useMutation({
    mutationFn: (sid: string) => api.post(`/incidents/${incidentId}/services`, { service_id: sid }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incident-services', incidentId] }); setPicking(false); },
  });

  const remove = useMutation({
    mutationFn: (sid: string) => api.delete(`/incidents/${incidentId}/services/${sid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident-services', incidentId] }),
  });

  const linkedIds = new Set(linked.map(l => l.id));
  const available = all.filter(s => !linkedIds.has(s.id));

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
        <Server size={14}/> Affected Services
      </h3>
      <div className="flex gap-1 flex-wrap">
        {linked.map(s => (
          <div key={s.id} className="flex items-center gap-1 bg-gray-50 border rounded-full pl-2 pr-1 py-0.5 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status] ?? 'bg-gray-300'}`}/>
            {s.name}
            <button onClick={() => remove.mutate(s.id)} className="p-0.5 text-gray-400 hover:text-red-500">
              <X size={10}/>
            </button>
          </div>
        ))}
        {linked.length === 0 && <span className="text-xs text-gray-400">No services linked</span>}
      </div>

      {picking ? (
        <div className="mt-3 flex gap-2 flex-wrap">
          {available.length === 0 && <span className="text-xs text-gray-400">No more services to add</span>}
          {available.map(s => (
            <button key={s.id} onClick={() => add.mutate(s.id)}
              className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full px-2 py-0.5">
              {s.name}
            </button>
          ))}
          <button onClick={() => setPicking(false)} className="text-xs text-gray-500">cancel</button>
        </div>
      ) : (
        <button onClick={() => setPicking(true)}
          className="mt-2 text-xs flex items-center gap-1 text-blue-600 hover:underline">
          <Plus size={11}/> Link service
        </button>
      )}
    </div>
  );
}
