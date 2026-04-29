import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Shift {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  starts_at: string;
  ends_at: string;
}
interface Schedule {
  id: string;
  name: string;
  timezone: string;
  rotation_days: number;
  shifts: Shift[] | null;
}
interface User { id: string; name: string; email: string }

export default function OnCall() {
  const qc = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);
  const [shiftFor, setShiftFor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shiftForm, setShiftForm] = useState({ user_id: '', starts_at: '', ends_at: '' });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ['oncall-schedules'],
    queryFn: () => api.get('/oncall/schedules').then(r => r.data.data),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });

  const { data: nowOnCall = [] } = useQuery<Array<{ schedule_name: string; user_name: string; user_email: string; ends_at: string }>>({
    queryKey: ['oncall-now'],
    queryFn: () => api.get('/oncall/now').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const createSched = useMutation({
    mutationFn: () => api.post('/oncall/schedules', { name }),
    onSuccess: () => { setName(''); setShowSchedule(false); qc.invalidateQueries({ queryKey: ['oncall-schedules'] }); },
  });

  const delSched = useMutation({
    mutationFn: (id: string) => api.delete(`/oncall/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oncall-schedules'] }),
  });

  const addShift = useMutation({
    mutationFn: (id: string) => api.post(`/oncall/schedules/${id}/shifts`, {
      user_id: shiftForm.user_id,
      starts_at: new Date(shiftForm.starts_at).toISOString(),
      ends_at: new Date(shiftForm.ends_at).toISOString(),
    }),
    onSuccess: () => {
      setShiftFor(null);
      setShiftForm({ user_id: '', starts_at: '', ends_at: '' });
      qc.invalidateQueries({ queryKey: ['oncall-schedules'] });
      qc.invalidateQueries({ queryKey: ['oncall-now'] });
      toast.success('Shift added');
    },
    onError: () => toast.error('Failed'),
  });

  const delShift = useMutation({
    mutationFn: (id: string) => api.delete(`/oncall/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-schedules'] });
      qc.invalidateQueries({ queryKey: ['oncall-now'] });
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold flex items-center gap-2"><CalendarClock size={20}/> On-Call</h1>
        <button onClick={() => setShowSchedule(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center gap-1">
          <Plus size={16}/> New Schedule
        </button>
      </div>

      {/* Currently on-call banner */}
      {nowOnCall.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="font-semibold text-green-900 text-sm mb-2">Currently On-Call</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {nowOnCall.map((o, i) => (
              <div key={i} className="text-sm flex justify-between bg-white rounded px-3 py-2 border">
                <div>
                  <div className="font-medium">{o.user_name}</div>
                  <div className="text-xs text-gray-500">{o.schedule_name}</div>
                </div>
                <div className="text-xs text-gray-400 self-center">until {format(new Date(o.ends_at), 'PP p')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-gray-400">No schedules yet.</p>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => (
            <div key={s.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{s.name}</h3>
                <span className="text-xs text-gray-500">{s.timezone}</span>
                <button onClick={() => setShiftFor(s.id)} className="ml-auto text-xs px-2 py-1 border rounded hover:bg-gray-50 flex items-center gap-1">
                  <Plus size={12}/> Shift
                </button>
                <button onClick={() => delSched.mutate(s.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                  <Trash2 size={14}/>
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {(s.shifts ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400">No shifts.</p>
                ) : s.shifts!.map(sh => (
                  <div key={sh.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                    <span className="font-medium">{sh.user_name}</span>
                    <span className="text-xs text-gray-500">
                      {format(new Date(sh.starts_at), 'PP p')} → {format(new Date(sh.ends_at), 'PP p')}
                    </span>
                    <button onClick={() => delShift.mutate(sh.id)} className="ml-auto text-red-500 hover:bg-red-50 p-1 rounded">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSchedule(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-lg">New Schedule</h2>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. Backend Primary"
              value={name} onChange={e => setName(e.target.value)}/>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSchedule(false)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button disabled={!name || createSched.isPending} onClick={() => createSched.mutate()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">Create</button>
            </div>
          </div>
        </div>
      )}

      {shiftFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShiftFor(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">Add Shift</h2>
              <button onClick={() => setShiftFor(null)}><X size={18}/></button>
            </div>
            <select className="w-full border rounded px-3 py-2 text-sm"
              value={shiftForm.user_id} onChange={e => setShiftForm({...shiftForm, user_id: e.target.value})}>
              <option value="">Select user…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Starts</label>
                <input type="datetime-local" className="w-full border rounded px-3 py-2 text-sm"
                  value={shiftForm.starts_at} onChange={e => setShiftForm({...shiftForm, starts_at: e.target.value})}/>
              </div>
              <div>
                <label className="text-xs text-gray-500">Ends</label>
                <input type="datetime-local" className="w-full border rounded px-3 py-2 text-sm"
                  value={shiftForm.ends_at} onChange={e => setShiftForm({...shiftForm, ends_at: e.target.value})}/>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShiftFor(null)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button
                disabled={!shiftForm.user_id || !shiftForm.starts_at || !shiftForm.ends_at || addShift.isPending}
                onClick={() => addShift.mutate(shiftFor)}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
