import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Save, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Postmortem {
  id: string;
  status: 'draft' | 'review' | 'published';
  summary: string | null;
  impact: string | null;
  root_cause: string | null;
  what_went_well: string | null;
  what_went_wrong: string | null;
  lessons: string | null;
  author_name: string | null;
  published_at: string | null;
  updated_at: string;
}

const FIELDS: Array<{ key: keyof Postmortem; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'impact', label: 'Impact' },
  { key: 'root_cause', label: 'Root Cause' },
  { key: 'what_went_well', label: 'What Went Well' },
  { key: 'what_went_wrong', label: 'What Went Wrong' },
  { key: 'lessons', label: 'Lessons / Action Items' },
];

export default function PostmortemPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data } = useQuery<Postmortem | null>({
    queryKey: ['postmortem', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/postmortem`).then(r => r.data.data),
  });

  useEffect(() => {
    if (data) {
      setForm({
        summary: data.summary ?? '',
        impact: data.impact ?? '',
        root_cause: data.root_cause ?? '',
        what_went_well: data.what_went_well ?? '',
        what_went_wrong: data.what_went_wrong ?? '',
        lessons: data.lessons ?? '',
      });
    }
  }, [data?.id]);

  const save = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/postmortem`, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['postmortem', incidentId] }); toast.success('Saved'); },
    onError: () => toast.error('Save failed'),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/incidents/${incidentId}/postmortem/status`, { status }),
    onSuccess: (_d, status) => {
      qc.invalidateQueries({ queryKey: ['postmortem', incidentId] });
      toast.success(`Marked ${status}`);
    },
    onError: () => toast.error('Update failed'),
  });

  return (
    <div className="bg-white border rounded-xl">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <FileText size={14}/> Postmortem
          {data && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              data.status === 'published' ? 'bg-green-100 text-green-700' :
              data.status === 'review' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-600'
            }`}>{data.status}</span>
          )}
        </span>
        <span className="text-xs text-gray-400">{open ? 'hide' : 'show'}</span>
      </button>

      {open && (
        <div className="p-4 pt-0 space-y-3">
          {FIELDS.map(f => (
            <div key={f.key as string}>
              <label className="text-xs font-medium text-gray-600">{f.label}</label>
              <textarea
                value={form[f.key as string] ?? ''}
                onChange={e => setForm(s => ({ ...s, [f.key as string]: e.target.value }))}
                rows={f.key === 'summary' ? 2 : 3}
                className="w-full border rounded p-2 text-sm mt-1"
              />
            </div>
          ))}

          <div className="flex gap-2 flex-wrap pt-2 border-t">
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm flex items-center gap-1">
              <Save size={12}/> Save Draft
            </button>
            {data && data.status === 'draft' && (
              <button onClick={() => setStatus.mutate('review')}
                className="px-3 py-1.5 border rounded text-sm">Send for Review</button>
            )}
            {data && data.status !== 'published' && (
              <button onClick={() => setStatus.mutate('published')}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1">
                <Send size={12}/> Publish
              </button>
            )}
            {data?.published_at && (
              <span className="text-xs text-gray-400 ml-auto self-center">
                Published {new Date(data.published_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
