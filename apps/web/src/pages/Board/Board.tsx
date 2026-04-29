import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout as LayoutIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
}

const COLUMNS: Array<{ key: string; label: string; color: string }> = [
  { key: 'open',          label: 'Open',          color: 'bg-red-50 border-red-200' },
  { key: 'investigating', label: 'Investigating', color: 'bg-orange-50 border-orange-200' },
  { key: 'monitoring',    label: 'Monitoring',    color: 'bg-yellow-50 border-yellow-200' },
  { key: 'resolved',      label: 'Resolved',      color: 'bg-green-50 border-green-200' },
];

const SEV_COLORS: Record<string, string> = {
  sev1: 'bg-red-600 text-white',
  sev2: 'bg-orange-500 text-white',
  sev3: 'bg-yellow-500 text-white',
  sev4: 'bg-blue-500 text-white',
};

export default function Board() {
  const qc = useQueryClient();
  const { data } = useQuery<{ incidents: Incident[] }>({
    queryKey: ['incidents'],
    queryFn: () => api.get('/incidents').then(r => r.data.data),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/incidents/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incidents'] }); toast.success('Moved'); },
    onError: () => toast.error('Move failed'),
  });

  const incidents = data?.incidents ?? [];
  const byStatus = (s: string) => incidents.filter(i => i.status === s);

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };
  const onDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) move.mutate({ id, status });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold flex items-center gap-2 mb-4">
        <LayoutIcon size={18}/> Board
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {COLUMNS.map(col => {
          const items = byStatus(col.key);
          return (
            <div key={col.key}
              onDragOver={e => e.preventDefault()}
              onDrop={e => onDrop(e, col.key)}
              className={`border rounded-xl ${col.color} min-h-[300px]`}>
              <div className="p-3 border-b flex justify-between items-center text-sm font-semibold">
                <span>{col.label}</span>
                <span className="text-xs text-gray-500">{items.length}</span>
              </div>
              <div className="p-2 space-y-2">
                {items.map(i => (
                  <div key={i.id}
                    draggable
                    onDragStart={e => onDragStart(e, i.id)}
                    className="bg-white border rounded p-2 cursor-move hover:shadow text-sm">
                    <Link to={`/incidents/${i.id}`} className="block">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-mono uppercase px-1.5 rounded ${SEV_COLORS[i.severity] ?? 'bg-gray-300'}`}>
                          {i.severity}
                        </span>
                      </div>
                      <div className="font-medium truncate">{i.title}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(i.created_at).toLocaleDateString()}
                      </div>
                    </Link>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-4">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
