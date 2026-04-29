import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Terminal, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const HELP: Array<{ cmd: string; desc: string }> = [
  { cmd: '/resolve',           desc: 'Mark incident resolved' },
  { cmd: '/reopen',            desc: 'Reopen incident' },
  { cmd: '/investigate',       desc: 'Status: investigating' },
  { cmd: '/monitor',           desc: 'Status: monitoring' },
  { cmd: '/sev1',              desc: 'Set severity P1' },
  { cmd: '/sev2',              desc: 'Set severity P2' },
  { cmd: '/sev3',              desc: 'Set severity P3' },
  { cmd: '/sev4',              desc: 'Set severity P4' },
  { cmd: '/ack',               desc: 'Acknowledge incident' },
  { cmd: '/assign user@x.com', desc: 'Assign commander by email' },
];

export default function SlashCommandBar({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const run = useMutation({
    mutationFn: (t: string) => api.post(`/incidents/${incidentId}/slash`, { text: t }),
    onSuccess: (r) => {
      toast.success(r.data?.data?.message || 'Done');
      setText('');
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Command failed'),
  });

  useEffect(() => {
    setShowHelp(text.trim() === '/' || text.trim() === '');
  }, [text]);

  const filtered = HELP.filter(h => !text || h.cmd.startsWith(text.split(' ')[0]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 relative">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-purple-600" />
        <h4 className="text-sm font-semibold dark:text-white">Slash Commands</h4>
        <button onClick={() => setShowHelp(s => !s)} className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-0.5">
          help <ChevronUp className={`w-3 h-3 transition-transform ${showHelp ? '' : 'rotate-180'}`} />
        </button>
      </div>
      <form onSubmit={e => { e.preventDefault(); if (text.trim()) run.mutate(text.trim()); }}>
        <input
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setShowHelp(true)}
          placeholder="/resolve, /sev1, /assign user@example.com…"
          className="w-full px-3 py-2 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 dark:text-white"
          disabled={run.isPending}
        />
      </form>
      {showHelp && filtered.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {filtered.map(h => (
            <button
              key={h.cmd}
              onClick={() => { setText(h.cmd); ref.current?.focus(); }}
              className="text-left flex items-baseline gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            >
              <code className="text-purple-600 dark:text-purple-400 font-mono">{h.cmd}</code>
              <span className="text-gray-500 truncate">{h.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
