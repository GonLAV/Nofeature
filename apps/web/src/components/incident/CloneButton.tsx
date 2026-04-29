import { useMutation } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function CloneButton({ incidentId }: { incidentId: string }) {
  const navigate = useNavigate();

  const clone = useMutation({
    mutationFn: () => api.post(`/incidents/${incidentId}/clone`).then(r => r.data.data),
    onSuccess: (data) => {
      toast.success('Incident cloned');
      navigate(`/incidents/${data.id}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Clone failed'),
  });

  return (
    <button
      onClick={() => {
        if (confirm('Create a clone of this incident?')) clone.mutate();
      }}
      disabled={clone.isPending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 rounded disabled:opacity-50"
      title="Clone this incident as a new open one"
    >
      <Copy className="w-3.5 h-3.5" /> Clone
    </button>
  );
}
