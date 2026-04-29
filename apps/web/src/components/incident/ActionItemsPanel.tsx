import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  due_date: string | null;
  assignee_name: string | null;
  assignee_id: string | null;
  created_at: string;
}

interface User { id: string; name: string; email: string }

export default function ActionItemsPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');

  const { data: items = [] } = useQuery<ActionItem[]>({
    queryKey: ['actions', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/actions`).then(r => r.data.data),
  });
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data.data ?? []).catch(() => []),
  });

  const create = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/actions`, {
      title, assignee_id: assignee || null, due_date: due || null,
    }),
    onSuccess: () => { setTitle(''); setAssignee(''); setDue(''); qc.invalidateQueries({ queryKey: ['actions', incidentId] }); toast.success('Action added'); },
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/actions/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['actions', incidentId] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/actions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['actions', incidentId] }),
  });

  return (
    <div className="bg-white rounded-xl border p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><CheckSquare size={16}/> Action Items</h2>

      <div className="flex gap-2 flex-wrap">
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="New action item…"
          className="flex-1 min-w-[200px] border rounded px-3 py-1.5 text-sm"/>
        <select value={assignee} onChange={e => setAssignee(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">Unassigned</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" value={due} onChange={e => setDue(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"/>
        <button onClick={() => title.trim() && create.mutate()} disabled={!title.trim() || create.isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm rounded flex items-center gap-1">
          <Plus size={14}/> Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No action items yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map(a => (
            <li key={a.id} className="py-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={a.status === 'done'}
                onChange={() => update.mutate({ id: a.id, status: a.status === 'done' ? 'open' : 'done' })}/>
              <div className="flex-1 min-w-0">
                <div className={`truncate ${a.status === 'done' ? 'line-through text-gray-400' : ''}`}>{a.title}</div>
                <div className="text-xs text-gray-400 flex gap-2">
                  {a.assignee_name && <span>@{a.assignee_name}</span>}
                  {a.due_date && <span>due {a.due_date}</span>}
                </div>
              </div>
              <select value={a.status} onChange={e => update.mutate({ id: a.id, status: e.target.value })}
                className="text-xs border rounded px-1 py-0.5">
                <option value="open">open</option>
                <option value="in_progress">in progress</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
              <button onClick={() => del.mutate(a.id)} className="text-gray-400 hover:text-red-500">
                <Trash2 size={14}/>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
