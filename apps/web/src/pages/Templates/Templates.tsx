import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Template {
  id: string;
  name: string;
  description: string | null;
  default_severity: string | null;
  default_title: string | null;
  default_description: string | null;
  default_systems: string[];
  checklist: Array<{ text: string; done?: boolean }>;
}

export default function Templates() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', default_severity: 'P2',
    default_title: '', default_description: '', default_systems: '',
    checklist: '',
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates').then(r => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/templates', {
      name: form.name,
      description: form.description || undefined,
      default_severity: form.default_severity || undefined,
      default_title: form.default_title || undefined,
      default_description: form.default_description || undefined,
      default_systems: form.default_systems.split(',').map(s => s.trim()).filter(Boolean),
      checklist: form.checklist.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ text })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setShow(false);
      setForm({ name: '', description: '', default_severity: 'P2', default_title: '', default_description: '', default_systems: '', checklist: '' });
      toast.success('Template created');
    },
    onError: () => toast.error('Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const useTemplate = async (t: Template) => {
    try {
      const r = await api.post(`/templates/${t.id}/launch`);
      toast.success('Incident created from template');
      qc.invalidateQueries({ queryKey: ['incidents'] });
      const id = r.data?.data?.id;
      if (id) window.location.assign(`/incidents/${id}`);
    } catch {
      toast.error('Failed to create incident');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold flex items-center gap-2"><FileText size={20}/> Incident Templates</h1>
        <button onClick={() => setShow(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center gap-1">
          <Plus size={16}/> New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-gray-400 text-sm">No templates yet. Create one to speed up common incidents.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.default_severity && (
                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded mt-1 inline-block">{t.default_severity}</span>
                  )}
                </div>
                <button onClick={() => deleteMut.mutate(t.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                  <Trash2 size={14}/>
                </button>
              </div>
              {t.description && <p className="text-sm text-gray-600 mt-2">{t.description}</p>}
              {t.checklist.length > 0 && (
                <ul className="mt-2 text-xs text-gray-700 space-y-0.5">
                  {t.checklist.slice(0, 4).map((c, i) => <li key={i}>• {c.text}</li>)}
                  {t.checklist.length > 4 && <li className="text-gray-400">+ {t.checklist.length - 4} more</li>}
                </ul>
              )}
              <button onClick={() => useTemplate(t)} className="mt-3 w-full bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border text-sm px-3 py-1.5 rounded">
                Use Template →
              </button>
            </div>
          ))}
        </div>
      )}

      {show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">New Template</h2>
              <button onClick={() => setShow(false)}><X size={18}/></button>
            </div>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Template name (e.g. Database Outage)"
              value={form.name} onChange={e => setForm({...form, name: e.target.value})}/>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Internal description"
              value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
            <select className="w-full border rounded px-3 py-2 text-sm" value={form.default_severity}
              onChange={e => setForm({...form, default_severity: e.target.value})}>
              <option value="P1">P1 - Critical</option>
              <option value="P2">P2 - High</option>
              <option value="P3">P3 - Medium</option>
              <option value="P4">P4 - Low</option>
            </select>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Default incident title"
              value={form.default_title} onChange={e => setForm({...form, default_title: e.target.value})}/>
            <textarea className="w-full border rounded px-3 py-2 text-sm" placeholder="Default description" rows={2}
              value={form.default_description} onChange={e => setForm({...form, default_description: e.target.value})}/>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Default systems (comma-separated)"
              value={form.default_systems} onChange={e => setForm({...form, default_systems: e.target.value})}/>
            <textarea className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="Checklist (one item per line)" rows={4}
              value={form.checklist} onChange={e => setForm({...form, checklist: e.target.value})}/>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShow(false)} className="px-3 py-2 text-sm border rounded">Cancel</button>
              <button disabled={!form.name || createMut.isPending} onClick={() => createMut.mutate()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
