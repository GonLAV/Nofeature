import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Trash2, Lock, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export default function CommentsPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(true);

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['comments', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/comments`).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const post = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/comments`, { body, is_internal: isInternal }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['comments', incidentId] });
    },
    onError: () => toast.error('Failed'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', incidentId] }),
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <MessageSquare size={14}/> Notes & Comments
      </h3>

      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-400">No comments yet.</p>
        ) : comments.map(c => (
          <div key={c.id} className={`border rounded-lg p-3 ${c.is_internal ? 'bg-yellow-50/40' : 'bg-blue-50/40'}`}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{c.user_name}</span>
              {c.is_internal ? <Lock size={11} className="text-yellow-700"/> : <Globe size={11} className="text-blue-700"/>}
              <span className="text-gray-400 ml-auto">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
              {(me?.id === c.user_id || me?.role === 'admin' || me?.role === 'owner') && (
                <button onClick={() => del.mutate(c.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                  <Trash2 size={12}/>
                </button>
              )}
            </div>
            <div className="text-sm mt-2 whitespace-pre-wrap">{c.body}</div>
          </div>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note…"
        rows={3}
        className="w-full border rounded px-3 py-2 text-sm resize-none"
      />
      <div className="flex items-center gap-2 mt-2">
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)}/>
          Internal only
        </label>
        <button
          disabled={!body.trim() || post.isPending}
          onClick={() => post.mutate()}
          className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm">
          Post
        </button>
      </div>
    </div>
  );
}
