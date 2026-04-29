import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, ArrowRight } from 'lucide-react';
import api from '../../lib/api';

interface IncidentLite { id: string; title: string; severity: string; status: string }

interface Action {
  id: string;
  label: string;
  hint?: string;
  perform: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const { data: incidents = [] } = useQuery<IncidentLite[]>({
    queryKey: ['palette-incidents'],
    queryFn: () => api.get('/incidents?limit=50').then(r => r.data.data.incidents),
    enabled: open,
    staleTime: 30_000,
  });

  const navActions: Action[] = useMemo(() => [
    { id: 'go-dashboard',   label: 'Go to Dashboard',    hint: 'navigate', perform: () => navigate('/') },
    { id: 'go-runbooks',    label: 'Go to Runbooks',     hint: 'navigate', perform: () => navigate('/runbooks') },
    { id: 'go-team',        label: 'Go to Team',         hint: 'navigate', perform: () => navigate('/team') },
    { id: 'go-audit',       label: 'Go to Audit Log',    hint: 'navigate', perform: () => navigate('/audit') },
    { id: 'go-analytics',   label: 'Go to Analytics',    hint: 'navigate', perform: () => navigate('/analytics') },
    { id: 'go-templates',   label: 'Go to Templates',    hint: 'navigate', perform: () => navigate('/templates') },
    { id: 'go-maintenance', label: 'Go to Maintenance',  hint: 'navigate', perform: () => navigate('/maintenance') },
    { id: 'go-integrations',label: 'Go to Integrations', hint: 'navigate', perform: () => navigate('/integrations') },
    { id: 'go-oncall',      label: 'Go to On-Call',      hint: 'navigate', perform: () => navigate('/oncall') },
    { id: 'go-settings',    label: 'Go to Settings',     hint: 'navigate', perform: () => navigate('/settings') },
    { id: 'go-digest',      label: 'View weekly digest', hint: 'AI',       perform: () => navigate('/digest') },
  ], [navigate]);

  const items: Action[] = useMemo(() => {
    const incActions: Action[] = incidents.map((i) => ({
      id: `inc-${i.id}`,
      label: `[${i.severity}] ${i.title}`,
      hint: i.status,
      perform: () => navigate(`/incidents/${i.id}`),
    }));
    const all = [...navActions, ...incActions];
    if (!q.trim()) return all.slice(0, 30);
    const term = q.toLowerCase();
    return all.filter((a) => a.label.toLowerCase().includes(term)).slice(0, 30);
  }, [navActions, incidents, q, navigate]);

  if (!open) return null;

  const run = (a: Action) => {
    setOpen(false);
    a.perform();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b">
          <Search size={16} className="text-gray-400"/>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); run(items[idx]); }
            }}
            placeholder="Type a command or search incidents…"
            className="flex-1 px-2 py-3 text-sm outline-none"
          />
          <kbd className="text-xs text-gray-400">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No matches</div>
          ) : items.map((a, i) => (
            <button key={a.id} onMouseEnter={() => setIdx(i)} onClick={() => run(a)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm ${
                i === idx ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}>
              <span className="flex-1 truncate">{a.label}</span>
              {a.hint && <span className="text-xs text-gray-400">{a.hint}</span>}
              <ArrowRight size={12} className="text-gray-300"/>
            </button>
          ))}
        </div>
        <div className="border-t px-3 py-2 text-xs text-gray-400 flex justify-between">
          <span>↑↓ navigate · ↵ select</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
