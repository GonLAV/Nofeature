import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

interface MyAction {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  incident_id: string;
  incident_title: string;
  incident_severity: string;
}

export default function MyActionItems() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<MyAction[]>({
    queryKey: ['my-actions'],
    queryFn: () => api.get('/actions/mine').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/actions/${id}`, { status: 'done' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-actions'] }),
  });

  if (data.length === 0) return null;

  return (
    <div className="bg-white border rounded-xl p-4">
      <h2 className="font-semibold flex items-center gap-2 mb-3 text-sm">
        <CheckSquare size={14}/> My Action Items <span className="text-xs text-gray-400">({data.length})</span>
      </h2>
      <ul className="divide-y">
        {data.slice(0, 6).map(a => (
          <li key={a.id} className="py-2 flex items-center gap-2 text-sm">
            <input type="checkbox" onChange={() => complete.mutate(a.id)}/>
            <Link to={`/incidents/${a.incident_id}`} className="flex-1 min-w-0">
              <div className="truncate">{a.title}</div>
              <div className="text-xs text-gray-400 truncate">
                <span className="font-mono mr-1">{a.incident_severity}</span>
                {a.incident_title}
                {a.due_date && <span className="ml-2">· due {a.due_date}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
