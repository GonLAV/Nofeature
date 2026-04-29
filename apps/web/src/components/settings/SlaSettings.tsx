import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface SlaTarget {
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  ack_minutes: number;
  resolve_minutes: number;
}

export default function SlaSettings() {
  const qc = useQueryClient();
  const { data } = useQuery<SlaTarget[]>({
    queryKey: ['sla'],
    queryFn: () => api.get('/sla').then(r => r.data.data),
  });
  const [targets, setTargets] = useState<SlaTarget[]>([]);

  useEffect(() => { if (data) setTargets(data); }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/sla', { targets }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla'] }); toast.success('SLA saved'); },
    onError: () => toast.error('Save failed'),
  });

  const update = (sev: string, field: 'ack_minutes' | 'resolve_minutes', val: number) => {
    setTargets(t => t.map(x => x.severity === sev ? { ...x, [field]: val } : x));
  };

  return (
    <section className="bg-white border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Clock size={16}/> SLA Targets</h2>
      <p className="text-xs text-gray-500">Time-to-acknowledge and time-to-resolve targets per severity (minutes).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b">
            <tr><th className="text-left py-2">Severity</th><th className="text-left">Ack (min)</th><th className="text-left">Resolve (min)</th></tr>
          </thead>
          <tbody>
            {targets.map(t => (
              <tr key={t.severity} className="border-b last:border-0">
                <td className="py-2 font-bold">{t.severity}</td>
                <td className="py-2">
                  <input type="number" min={1} value={t.ack_minutes}
                    onChange={e => update(t.severity, 'ack_minutes', parseInt(e.target.value) || 1)}
                    className="border rounded px-2 py-1 w-24"/>
                </td>
                <td className="py-2">
                  <input type="number" min={1} value={t.resolve_minutes}
                    onChange={e => update(t.severity, 'resolve_minutes', parseInt(e.target.value) || 1)}
                    className="border rounded px-2 py-1 w-24"/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => save.mutate()} disabled={save.isPending}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm flex items-center gap-1">
        <Save size={14}/> {save.isPending ? 'Saving…' : 'Save'}
      </button>
    </section>
  );
}
