import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface StatusUpdate {
  id: string;
  status: string;
  body: string;
  posted_at: string;
  posted_by_name: string;
}

const STATUSES = [
  { value: 'investigating', label: 'Investigating', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'identified',    label: 'Identified',    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'monitoring',    label: 'Monitoring',    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'update',        label: 'Update',        color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  { value: 'resolved',      label: 'Resolved',      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
];

const TEMPLATES: Record<string, string> = {
  investigating: 'We are currently investigating the issue and will provide an update shortly.',
  identified:    'We have identified the root cause and are working on a fix.',
  monitoring:    'A fix has been deployed. We are monitoring the system to ensure stability.',
  resolved:      'The incident has been resolved. All systems are operating normally.',
  update:        '',
};

export default function StatusUpdatesPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('investigating');
  const [body, setBody] = useState('');

  const { data: updates = [] } = useQuery<StatusUpdate[]>({
    queryKey: ['status-updates', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/status-updates`).then(r => r.data.data),
  });

  const post = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/status-updates`, { status, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status-updates', incidentId] });
      setBody('');
      toast.success('Update posted');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to post'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/status-updates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status-updates', incidentId] }),
  });

  const useTemplate = (s: string) => {
    setStatus(s);
    setBody(TEMPLATES[s] || '');
  };

  const meta = (s: string) => STATUSES.find(x => x.value === s) || STATUSES[3];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold dark:text-white">Stakeholder Updates</h3>
        <span className="text-xs text-gray-500 ml-auto">visible on public status page</span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => useTemplate(s.value)}
              className={`px-2 py-1 rounded text-xs font-medium ${s.color} ${status === s.value ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          placeholder="What should stakeholders know?"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-900 dark:text-white"
        />
        <button
          onClick={() => post.mutate()}
          disabled={!body.trim() || post.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" /> Broadcast
        </button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {updates.length === 0 && (
          <p className="text-xs text-gray-500 italic">No updates yet.</p>
        )}
        {updates.map(u => {
          const m = meta(u.status);
          return (
            <div key={u.id} className="border-l-2 border-blue-400 pl-3 py-1 group">
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${m.color}`}>{m.label}</span>
                <span className="text-gray-500">{u.posted_by_name}</span>
                <span className="text-gray-400">· {formatDistanceToNow(new Date(u.posted_at), { addSuffix: true })}</span>
                <button
                  onClick={() => del.mutate(u.id)}
                  className="ml-auto opacity-0 group-hover:opacity-100 text-red-500"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap dark:text-gray-200">{u.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
