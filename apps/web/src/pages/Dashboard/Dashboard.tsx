import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle, CheckCircle, Clock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import SlaWidget from '../../components/incident/SlaWidget';

const SEVERITY_COLORS: Record<string, string> = {
  P1: 'bg-red-100 text-red-800 border-red-200',
  P2: 'bg-orange-100 text-orange-800 border-orange-200',
  P3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  P4: 'bg-blue-100 text-blue-800 border-blue-200',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  open:          <AlertTriangle size={14} className="text-red-500" />,
  investigating: <Clock size={14} className="text-orange-500" />,
  resolved:      <CheckCircle size={14} className="text-green-500" />,
};

export default function Dashboard() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'P2' });

  const { data, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => api.get('/incidents').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/incidents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      setShowCreate(false);
      setForm({ title: '', description: '', severity: 'P2' });
      toast.success('Incident created — AI analysis starting...');
    },
    onError: () => toast.error('Failed to create incident'),
  });

  const incidents = data?.incidents ?? [];
  const open = incidents.filter((i: { status: string }) => i.status === 'open').length;
  const investigating = incidents.filter((i: { status: string }) => i.status === 'investigating').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SlaWidget />
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="text-red-500" size={20} /></div>
          <div><div className="text-2xl font-semibold">{open}</div><div className="text-sm text-gray-500">Open</div></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-50 rounded-lg"><Clock className="text-orange-500" size={20} /></div>
          <div><div className="text-2xl font-semibold">{investigating}</div><div className="text-sm text-gray-500">Investigating</div></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg"><Zap className="text-purple-500" size={20} /></div>
          <div><div className="text-2xl font-semibold">{incidents.length}</div><div className="text-sm text-gray-500">Total</div></div>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Active Incidents</h1>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
          <Plus size={16} /> New Incident
        </button>
      </div>

      {/* Incident List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
          <p>No active incidents 🎉</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident: { id: string; severity: string; title: string; status: string; created_at: string; ai_root_cause?: string }) => (
            <a key={incident.id} href={`/incidents/${incident.id}`}
              className="block bg-white rounded-xl border p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded border ${SEVERITY_COLORS[incident.severity]}`}>
                  {incident.severity}
                </span>
                <span className="font-medium flex-1">{incident.title}</span>
                <div className="flex items-center gap-1 text-sm text-gray-500 capitalize">
                  {STATUS_ICON[incident.status]} {incident.status}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(incident.created_at).toLocaleTimeString()}
                </span>
              </div>
              {incident.ai_root_cause && (
                <div className="mt-2 text-sm text-purple-600 flex items-center gap-1">
                  <Zap size={12} /> <span className="truncate">{incident.ai_root_cause}</span>
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Declare Incident</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  placeholder="Brief description of the incident" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  placeholder="What's happening? What's the impact?" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Severity</label>
                <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
                  <option value="P1">P1 — Critical (site down)</option>
                  <option value="P2">P2 — Major (significant impact)</option>
                  <option value="P3">P3 — Minor (partial degradation)</option>
                  <option value="P4">P4 — Low (cosmetic / edge case)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 border rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.title || !form.description}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {createMutation.isPending ? 'Creating...' : 'Declare Incident'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
