import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Github, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface IntCfg {
  id: string;
  provider: 'jira' | 'linear' | 'github';
  is_active: boolean;
  config: Record<string, unknown>;
}

export default function Integrations() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<'jira' | 'linear' | 'github' | null>(null);
  const [cfgFields, setCfgFields] = useState<Record<string, string>>({});

  const { data: configs = [] } = useQuery<IntCfg[]>({
    queryKey: ['integration-configs'],
    queryFn: () => api.get('/integrations/config').then(r => r.data.data),
  });

  const saveMut = useMutation({
    mutationFn: (payload: { provider: string; config: Record<string, string> }) =>
      api.put('/integrations/config', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-configs'] });
      setEditing(null);
      setCfgFields({});
      toast.success('Saved');
    },
    onError: () => toast.error('Failed'),
  });

  const PROVIDERS: Record<'jira' | 'linear' | 'github', { name: string; fields: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }> }> = {
    jira: {
      name: 'Jira',
      fields: [
        { key: 'baseUrl', label: 'Base URL', placeholder: 'https://yourorg.atlassian.net' },
        { key: 'email', label: 'Email' },
        { key: 'apiToken', label: 'API Token', secret: true },
        { key: 'projectKey', label: 'Project Key', placeholder: 'OPS' },
      ],
    },
    linear: {
      name: 'Linear',
      fields: [
        { key: 'apiKey', label: 'API Key', secret: true },
        { key: 'teamId', label: 'Team ID' },
      ],
    },
    github: {
      name: 'GitHub',
      fields: [
        { key: 'token', label: 'Personal Access Token', secret: true },
        { key: 'owner', label: 'Owner / Org' },
        { key: 'repo', label: 'Repo' },
      ],
    },
  };

  const isConfigured = (p: string) => configs.find(c => c.provider === p && c.is_active);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><Plug size={20}/> Integrations</h1>
      <p className="text-sm text-gray-500">
        Configure external trackers. Credentials are stored on the server; redacted values are never returned.
      </p>

      <div className="grid md:grid-cols-3 gap-3">
        {(['jira', 'linear', 'github'] as const).map(p => {
          const meta = PROVIDERS[p];
          const configured = isConfigured(p);
          return (
            <div key={p} className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-2">
                {p === 'github' ? <Github size={18}/> : <Plug size={18}/>}
                <h3 className="font-semibold">{meta.name}</h3>
                {configured ? (
                  <span className="ml-auto text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded flex items-center gap-1"><Check size={12}/> Connected</span>
                ) : (
                  <span className="ml-auto text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Not configured</span>
                )}
              </div>
              <button
                onClick={() => { setEditing(p); setCfgFields({}); }}
                className="mt-3 w-full text-sm border rounded px-3 py-1.5 hover:bg-gray-50">
                {configured ? 'Update' : 'Configure'}
              </button>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">Configure {PROVIDERS[editing].name}</h2>
              <button onClick={() => setEditing(null)}><X size={18}/></button>
            </div>
            {PROVIDERS[editing].fields.map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500">{f.label}</label>
                <input
                  type={f.secret ? 'password' : 'text'}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder={f.placeholder}
                  value={cfgFields[f.key] ?? ''}
                  onChange={e => setCfgFields({ ...cfgFields, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate({ provider: editing, config: cfgFields })}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
