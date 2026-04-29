import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Key, Shield, Webhook as WebhookIcon, Trash2, Plus, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import NotificationPrefs from '../../components/settings/NotificationPrefs';

interface ApiKey { id: string; name: string; key_prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }
interface IPRule { id: string; cidr: string; description: string | null }
interface Webhook { id: string; url: string; events: string[]; is_active: boolean; last_status: number | null; failure_count: number }
interface TenantSettings { incident_retention_days: number; audit_retention_days: number; ai_chat_retention_days: number; require_ip_allowlist: boolean }

export default function Settings() {
  const qc = useQueryClient();

  // ─── API Keys ────────────────────────────
  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys').then(r => r.data.data),
  });
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const createKey = useMutation({
    mutationFn: () => api.post('/api-keys', { name: newKeyName }).then(r => r.data.data),
    onSuccess: (data: { key: string }) => {
      setCreatedKey(data.key);
      setNewKeyName('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: () => toast.error('Failed'),
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  // ─── IP allowlist ────────────────────────
  const { data: ipRules = [] } = useQuery<IPRule[]>({
    queryKey: ['ip-allowlist'],
    queryFn: () => api.get('/security/allowlist').then(r => r.data.data),
  });
  const [newCidr, setNewCidr] = useState('');
  const [newCidrDesc, setNewCidrDesc] = useState('');
  const addCidr = useMutation({
    mutationFn: () => api.post('/security/allowlist', { cidr: newCidr, description: newCidrDesc || undefined }),
    onSuccess: () => { setNewCidr(''); setNewCidrDesc(''); qc.invalidateQueries({ queryKey: ['ip-allowlist'] }); },
    onError: () => toast.error('Invalid CIDR'),
  });
  const delCidr = useMutation({
    mutationFn: (id: string) => api.delete(`/security/allowlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ip-allowlist'] }),
  });

  // ─── Tenant settings ─────────────────────
  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/security/settings').then(r => r.data.data),
  });
  const saveSettings = useMutation({
    mutationFn: (s: Partial<TenantSettings>) => api.put('/security/settings', s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-settings'] }); toast.success('Saved'); },
  });

  // ─── Webhooks ────────────────────────────
  const { data: webhooks = [] } = useQuery<Webhook[]>({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks').then(r => r.data.data),
  });
  const [whUrl, setWhUrl] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [whEvents, setWhEvents] = useState<string[]>(['incident.created']);
  const createWh = useMutation({
    mutationFn: () => api.post('/webhooks', { url: whUrl, secret: whSecret || undefined, events: whEvents }),
    onSuccess: () => { setWhUrl(''); setWhSecret(''); qc.invalidateQueries({ queryKey: ['webhooks'] }); toast.success('Webhook created'); },
    onError: () => toast.error('Failed'),
  });
  const delWh = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
  const testWh = useMutation({
    mutationFn: (id: string) => api.post(`/webhooks/${id}/test`).then(r => r.data.data),
    onSuccess: (d: { status: number | null }) => toast.success(`Status: ${d.status ?? 'failed'}`),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold flex items-center gap-2"><SettingsIcon size={20}/> Settings</h1>

      <NotificationPrefs />

      {/* API Keys */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Key size={16}/> API Keys</h2>
        <p className="text-xs text-gray-500">Service tokens for programmatic access. Use header <code className="text-xs bg-gray-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>. <a href="/api/v1/docs" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View API docs ↗</a></p>
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-2 text-sm" placeholder="Key name (e.g. CI Pipeline)"
            value={newKeyName} onChange={e => setNewKeyName(e.target.value)}/>
          <button disabled={!newKeyName || createKey.isPending} onClick={() => createKey.mutate()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 rounded text-sm flex items-center gap-1">
            <Plus size={14}/> Generate
          </button>
        </div>
        {createdKey && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
            <div className="font-semibold text-yellow-900 mb-1">Copy this key now — it will not be shown again:</div>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-white border rounded px-2 py-1 text-xs break-all">{createdKey}</code>
              <button onClick={() => { navigator.clipboard.writeText(createdKey); toast.success('Copied'); }}
                className="p-1.5 hover:bg-yellow-100 rounded"><Copy size={14}/></button>
              <button onClick={() => setCreatedKey(null)} className="text-xs text-gray-600 px-2">Dismiss</button>
            </div>
          </div>
        )}
        {apiKeys.length === 0 ? (
          <p className="text-sm text-gray-400">No keys yet.</p>
        ) : (
          <div className="space-y-1">
            {apiKeys.map(k => (
              <div key={k.id} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                <span className="font-medium">{k.name}</span>
                <code className="text-xs text-gray-500">{k.key_prefix}…</code>
                {k.revoked_at && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Revoked</span>}
                <span className="ml-auto text-xs text-gray-400">
                  {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'never used'}
                </span>
                {!k.revoked_at && (
                  <button onClick={() => revokeKey.mutate(k.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* IP allowlist */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Shield size={16}/> IP Allowlist</h2>
        <p className="text-xs text-gray-500">Restrict access by IP / CIDR ranges.</p>
        <div className="flex gap-2">
          <input className="w-48 border rounded px-3 py-2 text-sm" placeholder="10.0.0.0/24"
            value={newCidr} onChange={e => setNewCidr(e.target.value)}/>
          <input className="flex-1 border rounded px-3 py-2 text-sm" placeholder="Description"
            value={newCidrDesc} onChange={e => setNewCidrDesc(e.target.value)}/>
          <button disabled={!newCidr || addCidr.isPending} onClick={() => addCidr.mutate()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 rounded text-sm">Add</button>
        </div>
        {ipRules.map(r => (
          <div key={r.id} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
            <code className="bg-gray-100 px-2 rounded">{r.cidr}</code>
            <span className="text-gray-500 text-xs">{r.description}</span>
            <button onClick={() => delCidr.mutate(r.id)} className="ml-auto text-red-500 hover:bg-red-50 p-1 rounded">
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
      </section>

      {/* Retention */}
      {settings && (
        <section className="bg-white border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold">Data Retention</h2>
          <div className="grid grid-cols-3 gap-3">
            {(['incident_retention_days', 'audit_retention_days', 'ai_chat_retention_days'] as const).map(k => (
              <label key={k} className="text-sm">
                <span className="text-xs text-gray-500 block capitalize">{k.replace(/_/g, ' ').replace('days', '(days)')}</span>
                <input type="number" min={1} max={3650} className="w-full border rounded px-3 py-2 text-sm"
                  defaultValue={settings[k]}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v && v !== settings[k]) saveSettings.mutate({ [k]: v });
                  }}/>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={settings.require_ip_allowlist}
              onChange={(e) => saveSettings.mutate({ require_ip_allowlist: e.target.checked })}/>
            Require IP allowlist for all traffic
          </label>
        </section>
      )}

      {/* Webhooks */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><WebhookIcon size={16}/> Outgoing Webhooks</h2>
        <p className="text-xs text-gray-500">POST events to your endpoints. Signed with HMAC-SHA256 if a secret is set.</p>
        <input className="w-full border rounded px-3 py-2 text-sm" placeholder="https://example.com/incidents"
          value={whUrl} onChange={e => setWhUrl(e.target.value)}/>
        <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Signing secret (optional)"
          value={whSecret} onChange={e => setWhSecret(e.target.value)}/>
        <div className="flex gap-2 flex-wrap">
          {['incident.created', 'incident.updated', 'incident.resolved', 'incident.severity_changed', 'maintenance.scheduled'].map(ev => (
            <label key={ev} className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={whEvents.includes(ev)}
                onChange={(e) => setWhEvents(e.target.checked ? [...whEvents, ev] : whEvents.filter(x => x !== ev))}/>
              {ev}
            </label>
          ))}
        </div>
        <button disabled={!whUrl || whEvents.length === 0 || createWh.isPending}
          onClick={() => createWh.mutate()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">
          Create Webhook
        </button>
        {webhooks.map(w => (
          <div key={w.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
            <code className="text-xs flex-1 truncate">{w.url}</code>
            <span className="text-xs text-gray-500">{w.events.length} events</span>
            {w.last_status && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                w.last_status >= 200 && w.last_status < 300 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>{w.last_status}</span>
            )}
            <button onClick={() => testWh.mutate(w.id)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Test</button>
            <button onClick={() => delWh.mutate(w.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
