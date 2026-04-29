import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';

interface Mention {
  id: string;
  comment_id: string;
  incident_id: string;
  read_at: string | null;
  created_at: string;
  incident_title: string;
  severity: string;
  mentioned_by_name: string | null;
  comment_body: string | null;
}

export default function MentionsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: countData } = useQuery<{ unread: number }>({
    queryKey: ['mentions-count'],
    queryFn: () => api.get('/mentions/count').then(r => r.data.data),
    refetchInterval: 30_000,
  });
  const unread = countData?.unread ?? 0;

  const { data: mentions = [] } = useQuery<Mention[]>({
    queryKey: ['mentions'],
    queryFn: () => api.get('/mentions').then(r => r.data.data),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/mentions/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentions'] });
      qc.invalidateQueries({ queryKey: ['mentions-count'] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/mentions/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentions'] });
      qc.invalidateQueries({ queryKey: ['mentions-count'] });
    },
  });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="p-2 rounded-lg hover:bg-gray-100 relative">
        <Bell size={16}/>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-4 h-4 flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white border rounded-xl shadow-lg z-30 max-h-96 overflow-auto">
          <div className="px-3 py-2 border-b flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-700">Mentions</span>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <CheckCheck size={11}/> Mark all read
              </button>
            )}
          </div>
          {mentions.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">No mentions.</div>
          ) : (
            <ul className="divide-y">
              {mentions.map(m => (
                <li key={m.id} className={`p-3 text-sm ${!m.read_at ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Link to={`/incidents/${m.incident_id}`}
                      onClick={() => { setOpen(false); if (!m.read_at) markRead.mutate(m.id); }}
                      className="flex-1 min-w-0">
                      <div className="text-xs text-gray-400">
                        {m.mentioned_by_name ?? 'Someone'} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </div>
                      <div className="font-medium truncate">{m.incident_title}</div>
                      {m.comment_body && (
                        <div className="text-xs text-gray-600 truncate">{m.comment_body}</div>
                      )}
                    </Link>
                    {!m.read_at && (
                      <button onClick={() => markRead.mutate(m.id)} className="text-gray-400 hover:text-blue-600">
                        <Check size={14}/>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
