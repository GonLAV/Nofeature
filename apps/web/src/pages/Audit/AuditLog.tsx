import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { format } from 'date-fns';
import { ScrollText } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

interface AuditLog {
  id: string;
  action: string;
  resource?: string;
  resource_id?: string;
  ip_address?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ action: '', resource: '' });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.action)   params.set('action', filter.action);
      if (filter.resource) params.set('resource', filter.resource);
      params.set('limit', '100');
      const { data } = await api.get(`/audit?${params}`);
      setLogs(data.data.logs);
      setTotal(data.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <ScrollText className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <span className="ml-auto text-sm text-gray-500">{total} entries</span>
        <button
          onClick={async () => {
            const token = useAuthStore.getState().accessToken;
            const base = (import.meta.env.VITE_API_URL ?? '/api/v1') as string;
            const resp = await fetch(`${base}/audit/export.csv?days=90`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!resp.ok) return;
            const blob = await resp.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `audit-${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(a.href);
          }}
          className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50">
          Export CSV
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          placeholder="Action (e.g. login, incident.create)"
          value={filter.action}
          onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <input
          placeholder="Resource (e.g. incident, user)"
          value={filter.resource}
          onChange={(e) => setFilter({ ...filter, resource: e.target.value })}
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button onClick={load} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">
          Filter
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Action</th>
              <th className="text-left px-3 py-2">Resource</th>
              <th className="text-left px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">No audit entries.</td></tr>
            ) : logs.map((l) => (
              <tr key={l.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss')}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{l.user_name ?? '—'}</div>
                  <div className="text-xs text-gray-500">{l.user_email}</div>
                </td>
                <td className="px-3 py-2"><code className="text-xs bg-gray-100 px-1 rounded">{l.action}</code></td>
                <td className="px-3 py-2 text-gray-600">
                  {l.resource}{l.resource_id ? ` · ${String(l.resource_id).slice(0, 8)}` : ''}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{l.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
