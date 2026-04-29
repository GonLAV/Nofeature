import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Plus, Trash2, Play, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Step { title: string; description?: string; command?: string; }
interface Runbook {
  id: string;
  title: string;
  description?: string;
  severity?: 'P1' | 'P2' | 'P3' | 'P4' | null;
  tags?: string[];
  steps: Step[];
  updated_at: string;
}

const sevColor: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-yellow-100 text-yellow-700',
  P4: 'bg-blue-100 text-blue-700',
};

export default function Runbooks() {
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [active, setActive] = useState<Runbook | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'' | 'P1' | 'P2' | 'P3' | 'P4'>('');
  const [tagsInput, setTagsInput] = useState('');
  const [steps, setSteps] = useState<Step[]>([{ title: '' }]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/runbooks');
      setRunbooks(data.data);
    } catch {
      toast.error('Failed to load runbooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setTitle(''); setDescription(''); setSeverity(''); setTagsInput('');
    setSteps([{ title: '' }]); setShowForm(false);
  };

  const submit = async () => {
    if (!title.trim() || steps.every((s) => !s.title.trim())) {
      toast.error('Title and at least one step are required');
      return;
    }
    try {
      await api.post('/runbooks', {
        title: title.trim(),
        description: description.trim() || undefined,
        severity: severity || undefined,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        steps: steps.filter((s) => s.title.trim()),
      });
      toast.success('Runbook created');
      reset();
      load();
    } catch {
      toast.error('Failed to create runbook');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this runbook?')) return;
    try {
      await api.delete(`/runbooks/${id}`);
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Runbooks</h1>
          <p className="text-sm text-gray-500">Pre-defined response playbooks for common incidents</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Runbook
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : runbooks.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
          No runbooks yet. Create your first one to standardize incident response.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {runbooks.map((r) => (
            <div key={r.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{r.title}</h3>
                {r.severity && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sevColor[r.severity]}`}>{r.severity}</span>
                )}
              </div>
              {r.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{r.description}</p>}
              {r.tags && r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {r.tags.map((t) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-500 mb-3">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActive(r)}
                  className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 py-1.5 rounded flex items-center justify-center gap-1"
                >
                  <Play className="w-3 h-3" /> View
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="text-sm bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1.5 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">New Runbook</h2>
              <button onClick={reset}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <input
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={2}
              />
              <div className="flex gap-2">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                  className="border rounded px-3 py-2"
                >
                  <option value="">Any severity</option>
                  <option value="P1">P1</option><option value="P2">P2</option>
                  <option value="P3">P3</option><option value="P4">P4</option>
                </select>
                <input
                  placeholder="tags, comma, separated"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="flex-1 border rounded px-3 py-2"
                />
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Steps</div>
                {steps.map((s, idx) => (
                  <div key={idx} className="border rounded p-2 mb-2">
                    <div className="flex gap-2 mb-1">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">{idx + 1}</span>
                      <input
                        placeholder="Step title"
                        value={s.title}
                        onChange={(e) => {
                          const next = [...steps]; next[idx] = { ...next[idx], title: e.target.value }; setSteps(next);
                        }}
                        className="flex-1 border rounded px-2 py-1 text-sm"
                      />
                      {steps.length > 1 && (
                        <button onClick={() => setSteps(steps.filter((_, i) => i !== idx))} className="text-red-500 text-sm">
                          ×
                        </button>
                      )}
                    </div>
                    <textarea
                      placeholder="Description (optional)"
                      value={s.description ?? ''}
                      onChange={(e) => {
                        const next = [...steps]; next[idx] = { ...next[idx], description: e.target.value }; setSteps(next);
                      }}
                      className="w-full border rounded px-2 py-1 text-sm mb-1"
                      rows={2}
                    />
                    <input
                      placeholder="Command (optional)"
                      value={s.command ?? ''}
                      onChange={(e) => {
                        const next = [...steps]; next[idx] = { ...next[idx], command: e.target.value }; setSteps(next);
                      }}
                      className="w-full border rounded px-2 py-1 text-sm font-mono"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setSteps([...steps, { title: '' }])}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add step
                </button>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={reset} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
              <button onClick={submit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* View modal */}
      {active && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{active.title}</h2>
                {active.severity && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sevColor[active.severity]}`}>{active.severity}</span>
                )}
              </div>
              <button onClick={() => setActive(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              {active.description && <p className="text-sm text-gray-700 mb-4">{active.description}</p>}
              <ol className="space-y-3">
                {active.steps.map((s, idx) => (
                  <li key={idx} className="border-l-4 border-blue-500 pl-3 py-1">
                    <div className="font-semibold text-gray-900">{idx + 1}. {s.title}</div>
                    {s.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{s.description}</p>}
                    {s.command && (
                      <pre className="mt-2 bg-gray-900 text-green-300 text-xs p-2 rounded overflow-x-auto">{s.command}</pre>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
