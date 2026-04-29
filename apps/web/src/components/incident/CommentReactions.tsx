import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Smile } from 'lucide-react';
import api from '../../lib/api';

const QUICK = ['👍','✅','❤️','🎉','🚀','👀','🔥'];

interface ReactionGroup { count: number; users: string[]; mine: boolean }

export default function CommentReactions({ commentId }: { commentId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = {} } = useQuery<Record<string, ReactionGroup>>({
    queryKey: ['reactions', commentId],
    queryFn: () => api.get(`/comments/${commentId}/reactions`).then(r => r.data.data),
  });

  const toggle = useMutation({
    mutationFn: (emoji: string) => api.post(`/comments/${commentId}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reactions', commentId] }),
  });

  const entries = Object.entries(data);

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {entries.map(([emoji, g]) => (
        <button key={emoji} onClick={() => toggle.mutate(emoji)}
          title={g.users.join(', ')}
          className={`text-xs px-1.5 py-0.5 rounded-full border ${
            g.mine ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}>
          {emoji} {g.count}
        </button>
      ))}
      <div className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="text-xs px-1.5 py-0.5 rounded-full border bg-white hover:bg-gray-50 text-gray-500">
          <Smile size={11}/>
        </button>
        {open && (
          <div className="absolute bottom-full left-0 mb-1 bg-white border rounded shadow p-1 flex gap-0.5 z-10">
            {QUICK.map(e => (
              <button key={e} onClick={() => { toggle.mutate(e); setOpen(false); }}
                className="text-base hover:bg-gray-100 rounded p-0.5">{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
