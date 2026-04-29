import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface User { id: string; name: string; email: string }
interface Schedule { id: string; name: string }
interface Step {
  id: string;
  step_order: number;
  delay_minutes: number;
  user_id: string | null;
  schedule_id: string | null;
  user_name: string | null;
  schedule_name: string | null;
}
interface Policy {
  id: string;
  name: string;
  trigger_severity: string | null;
  steps: Step[] | null;
}

export default function Escalations() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSev, setNewSev] = useState('');
  const [stepFor, setStepFor] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState({ delay_minutes: 5, user_id: '', schedule_id: '' });

  const { data: policies = [] } = useQuery<Policy[]>({
    queryKey: ['esc-policies'],
    queryFn: () => api.get('/escalations/policies').then(r => r.data.data),
  });
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });
  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ['oncall-schedules'],
    queryFn: () => api.get('/oncall/schedules').then(r => r.data.data),
  });

  const createPolicy = useMutation({
    mutationFn: () => api.post('/escalations/policies', {
      name: newName,
      trigger_severity: newSev || undefined,
    }),
    onSuccess: () => {
      setNewName(''); setNewSev(''); setShowNew(false);
      qc.invalidateQueries({ queryKey: ['esc-policies'] });
    },
  });

  const delPolicy = useMutation({
    mutationFn: (id: string) => api.delete(`/escalations/policies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['esc-policies'] }),
  });

  const addStep = useMutation({
    mutationFn: (policyId: string) => {
      const policy = policies.find(p => p.id === policyId);
      const nextOrder = (policy?.steps?.length ?? 0) + 1;
      return api.post(`/escalations/policies/${policyId}/steps`, {
        step_order: nextOrder,
        delay_minutes: stepForm.delay_minutes,
        user_id: stepForm.user_id || undefined,
        schedule_id: stepForm.schedule_id || undefined,
      });
    },
    onSuccess: () => {
      setStepFor(null);
      setStepForm({ delay_minutes: 5, user_id: '', schedule_id: '' });
      qc.invalidateQueries({ queryKey: ['esc-policies'] });
      toast.success('Step added');
    },
    onError: () => toast.error('Failed'),
  });

  const delStep = useMutation({
    mutationFn: (id: string) => api.delete(`/escalations/steps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['esc-policies'] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Bell size={20}/> Escalation Policies</h1>
        <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center gap-1">
          <Plus size={16}/> New Policy
        </button>
      </div>

      {policies.length === 0 ? (
        <p className="text-sm text-gray-400">No policies yet.</p>
      ) : (
        <div className="space-y-3">
          {policies.map(p => (
            <div key={p.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{p.name}</h3>
                {p.trigger_severity && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">{p.trigger_severity}+</span>
                )}
                <button onClick={() => setStepFor(p.id)} className="ml-auto text-xs px-2 py-1 border rounded hover:bg-gray-50 flex items-center gap-1">
                  <Plus size={12}/> Step
                </button>
                <button onClick={() => delPolicy.mutate(p.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                  <Trash2 size={14}/>
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {(p.steps ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400">No steps configured.</p>
                ) : (
                  p.steps!.map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                      <span className="font-medium w-6 text-gray-500">#{s.step_order}</span>
                      <span className="text-xs text-gray-500">After {s.delay_minutes}m</span>
                      <span className="font-medium">→</span>
                      <span>{s.user_name ?? s.schedule_name ?? '?'}</span>
                      {s.schedule_name && <span className="text-xs text-blue-700 px-1.5 bg-blue-50 rounded">on-call</span>}
                      <button onClick={() => delStep.mutate(s.id)} className="ml-auto text-red-500 hover:bg-red-50 p-1 rounded">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New policy modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-lg">New Policy</h2>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Policy name"
              value={newName} onChange={e => setNewName(e.target.value)}/>
            <select className="w-full border rounded px-3 py-2 text-sm"
              value={newSev} onChange={e => setNewSev(e.target.value)}>
              <option value="">No severity trigger (manual only)</option>
              <option value="P1">P1+</option>
              <option value="P2">P2+</option>
              <option value="P3">P3+</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button disabled={!newName || createPolicy.isPending} onClick={() => createPolicy.mutate()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add step modal */}
      {stepFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setStepFor(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Add Step</h2>
              <button onClick={() => setStepFor(null)}><X size={18}/></button>
            </div>
            <label className="text-sm block">
              <span className="text-xs text-gray-500">Delay before paging (minutes)</span>
              <input type="number" min={0} max={1440} className="w-full border rounded px-3 py-2 text-sm mt-1"
                value={stepForm.delay_minutes}
                onChange={e => setStepForm({...stepForm, delay_minutes: parseInt(e.target.value, 10) || 0})}/>
            </label>
            <label className="text-sm block">
              <span className="text-xs text-gray-500">Page user</span>
              <select className="w-full border rounded px-3 py-2 text-sm mt-1"
                value={stepForm.user_id}
                onChange={e => setStepForm({...stepForm, user_id: e.target.value, schedule_id: ''})}>
                <option value="">— none —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </label>
            <div className="text-center text-xs text-gray-400">— or —</div>
            <label className="text-sm block">
              <span className="text-xs text-gray-500">Page on-call schedule</span>
              <select className="w-full border rounded px-3 py-2 text-sm mt-1"
                value={stepForm.schedule_id}
                onChange={e => setStepForm({...stepForm, schedule_id: e.target.value, user_id: ''})}>
                <option value="">— none —</option>
                {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setStepFor(null)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button
                disabled={(!stepForm.user_id && !stepForm.schedule_id) || addStep.isPending}
                onClick={() => addStep.mutate(stepFor)}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
