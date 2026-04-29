import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Server } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Service {
  id: string;
  name: string;
  description: string | null;
  status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance';
  owner_name: string | null;
  active_incidents: string;
}

const STATUSES: Service['status'][] = ['operational','degraded','partial_outage','major_outage','maintenance'];

const STATUS_STYLES: Record<Service['status'], string> = {
  operational:    'bg-green-100 text-green-700',
  degraded:       'bg-yellow-100 text-yellow-700',
  partial_outage: 'bg-orange-100 text-orange-700',
  major_outage:   'bg-red-100 text-red-700',
  maintenance:    'bg-blue-100 text-blue-700',
};

export default function ServicesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const { data = [] } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data.data),
  });

  const create = useMutation({
    mutationFn: () => api.post('/services', { name: name.trim(), description: desc.trim() || null }),
    onSuccess: () => { setName(''); setDesc(''); qc.invalidateQueries({ queryKey: ['services'] }); toast.success('Created'); },
    onError: () => toast.error('Create failed'),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/services/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); toast.success('Deleted'); },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><Server size={18}/> Service Catalog</h1>

      <div className="bg-white border rounded-xl p-4 space-y-2">
        <div className="text-sm font-medium">Add Service</div>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Service name (e.g., Checkout API)"
            className="border rounded px-2 py-1.5 text-sm flex-1"/>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="border rounded px-2 py-1.5 text-sm flex-1"/>
          <button onClick={() => name.trim() && create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1.5 text-sm flex items-center gap-1">
            <Plus size={14}/> Add
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl divide-y">
        {data.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No services</div>}
        {data.map(s => (
          <div key={s.id} className="p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{s.name}</div>
              {s.description && <div className="text-sm text-gray-500">{s.description}</div>}
              <div className="text-xs text-gray-400">
                {s.owner_name && <>Owner: {s.owner_name} · </>}
                {Number(s.active_incidents) > 0 && <span className="text-red-600">{s.active_incidents} active incidents</span>}
              </div>
            </div>
            <select value={s.status}
              onChange={e => update.mutate({ id: s.id, status: e.target.value })}
              className={`text-xs rounded px-2 py-1 border ${STATUS_STYLES[s.status]}`}>
              {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            <button onClick={() => confirm(`Delete ${s.name}?`) && del.mutate(s.id)}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded">
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
