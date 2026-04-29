import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface MaintWindow {
  id: string;
  title: string;
  description: string | null;
  affected_systems: string[];
  starts_at: string;
  ends_at: string;
  status: string;
}

export default function Maintenance() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', affected_systems: '',
    starts_at: '', ends_at: '',
  });

  const { data: windows = [] } = useQuery<MaintWindow[]>({
    queryKey: ['maintenance'],
    queryFn: () => api.get('/maintenance').then(r => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/maintenance', {
      title: form.title,
      description: form.description || undefined,
      affected_systems: form.affected_systems.split(',').map(s => s.trim()).filter(Boolean),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      setShowModal(false);
      setForm({ title: '', description: '', affected_systems: '', starts_at: '', ends_at: '' });
      toast.success('Maintenance scheduled');
    },
    onError: () => toast.error('Failed to schedule'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.patch(`/maintenance/${id}`, { status: 'cancelled' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Calendar size={20}/> Maintenance Windows</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center gap-1">
          <Plus size={16}/> Schedule
        </button>
      </div>

      {windows.length === 0 ? (
        <p className="text-gray-400 text-sm">No maintenance windows yet.</p>
      ) : (
        <div className="space-y-2">
          {windows.map(w => (
            <div key={w.id} className="bg-white border rounded-xl p-4 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{w.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    w.status === 'in_progress' ? 'bg-orange-100 text-orange-800' :
                    w.status === 'completed' ? 'bg-green-100 text-green-800' :
                    w.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                    'bg-blue-100 text-blue-800'
                  }`}>{w.status}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {format(new Date(w.starts_at), 'PPp')} → {format(new Date(w.ends_at), 'PPp')}
                </div>
                {w.affected_systems.length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    Systems: {w.affected_systems.join(', ')}
                  </div>
                )}
                {w.description && <p className="text-sm text-gray-700 mt-2">{w.description}</p>}
              </div>
              <div className="flex gap-1">
                {w.status !== 'cancelled' && w.status !== 'completed' && (
                  <button onClick={() => cancelMut.mutate(w.id)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Cancel</button>
                )}
                <button onClick={() => deleteMut.mutate(w.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-lg">Schedule Maintenance</h2>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Title"
              value={form.title} onChange={e => setForm({...form, title: e.target.value})}/>
            <textarea className="w-full border rounded px-3 py-2 text-sm" placeholder="Description" rows={3}
              value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Affected systems (comma-separated)"
              value={form.affected_systems} onChange={e => setForm({...form, affected_systems: e.target.value})}/>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Starts</label>
                <input type="datetime-local" className="w-full border rounded px-3 py-2 text-sm"
                  value={form.starts_at} onChange={e => setForm({...form, starts_at: e.target.value})}/>
              </div>
              <div>
                <label className="text-xs text-gray-500">Ends</label>
                <input type="datetime-local" className="w-full border rounded px-3 py-2 text-sm"
                  value={form.ends_at} onChange={e => setForm({...form, ends_at: e.target.value})}/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button
                disabled={!form.title || !form.starts_at || !form.ends_at || createMut.isPending}
                onClick={() => createMut.mutate()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
