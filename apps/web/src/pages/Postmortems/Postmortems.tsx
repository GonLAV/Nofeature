import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import api from '../../lib/api';

interface Item {
  id: string;
  incident_id: string;
  incident_title: string;
  severity: string;
  status: 'draft' | 'review' | 'published';
  summary: string | null;
  author_name: string | null;
  published_at: string | null;
  updated_at: string;
}

export default function PostmortemsPage() {
  const [status, setStatus] = useState<string>('');
  const { data = [] } = useQuery<Item[]>({
    queryKey: ['postmortems', status],
    queryFn: () => api.get(`/postmortems${status ? `?status=${status}` : ''}`).then(r => r.data.data),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><FileText size={18}/> Postmortems</h1>

      <div className="flex gap-2">
        {['', 'draft', 'review', 'published'].map(s => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`text-xs px-3 py-1 rounded-full border ${status === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'}`}>
            {s || 'all'}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl divide-y">
        {data.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No postmortems</div>}
        {data.map(p => (
          <Link key={p.id} to={`/incidents/${p.incident_id}`} className="block p-4 hover:bg-gray-50">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs uppercase text-gray-500">{p.severity}</span>
              <span className="font-medium text-sm flex-1 truncate">{p.incident_title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                p.status === 'published' ? 'bg-green-100 text-green-700' :
                p.status === 'review' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>{p.status}</span>
            </div>
            {p.summary && <div className="text-sm text-gray-600 line-clamp-2">{p.summary}</div>}
            <div className="text-xs text-gray-400 mt-1">
              {p.author_name && <>by {p.author_name} · </>}
              updated {new Date(p.updated_at).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
