import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import api from '../../lib/api';

interface Watched {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
}

export default function WatchingWidget() {
  const { data = [] } = useQuery<Watched[]>({
    queryKey: ['watching'],
    queryFn: () => api.get('/watching').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  if (data.length === 0) return null;

  return (
    <div className="bg-white border rounded-xl p-4">
      <h2 className="font-semibold flex items-center gap-2 mb-3 text-sm">
        <Eye size={14}/> Watching <span className="text-xs text-gray-400">({data.length})</span>
      </h2>
      <ul className="divide-y">
        {data.slice(0, 6).map(i => (
          <li key={i.id} className="py-2 text-sm">
            <Link to={`/incidents/${i.id}`} className="block hover:bg-gray-50 -mx-2 px-2 rounded">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase text-gray-500">{i.severity}</span>
                <span className="flex-1 truncate">{i.title}</span>
                <span className="text-xs text-gray-400">{i.status}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
