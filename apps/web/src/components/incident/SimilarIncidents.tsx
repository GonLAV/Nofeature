import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api';

interface Similar {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  ai_summary: string | null;
  score: number;
}

export default function SimilarIncidents({ incidentId }: { incidentId: string }) {
  const { data = [], isLoading } = useQuery<Similar[]>({
    queryKey: ['similar', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/similar`).then(r => r.data.data),
  });

  if (isLoading) return null;
  if (data.length === 0) return null;

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-purple-500"/> Similar past incidents
      </h3>
      <div className="space-y-2">
        {data.map(s => (
          <Link key={s.id} to={`/incidents/${s.id}`}
            className="block border rounded-lg p-3 hover:bg-gray-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{s.severity}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{s.status}</span>
              <span className="text-xs text-gray-400 ml-auto">{format(new Date(s.created_at), 'PP')}</span>
            </div>
            <div className="mt-1 text-sm font-medium">{s.title}</div>
            {s.ai_summary && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{s.ai_summary}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
