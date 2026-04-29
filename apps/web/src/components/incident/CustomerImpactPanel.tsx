import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface Props {
  incidentId: string;
  customers_affected?: number | null;
  revenue_impact_usd?: number | null;
}

export default function CustomerImpactPanel({ incidentId, customers_affected, revenue_impact_usd }: Props) {
  const qc = useQueryClient();
  const [customers, setCustomers] = useState<string>('');
  const [revenue, setRevenue] = useState<string>('');

  useEffect(() => {
    setCustomers(customers_affected != null ? String(customers_affected) : '');
    setRevenue(revenue_impact_usd != null ? String(revenue_impact_usd) : '');
  }, [customers_affected, revenue_impact_usd]);

  const save = useMutation({
    mutationFn: () => api.patch(`/incidents/${incidentId}/impact`, {
      customers_affected: customers ? parseInt(customers, 10) : undefined,
      revenue_impact_usd: revenue ? parseFloat(revenue) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      toast.success('Impact saved');
    },
  });

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Customer / Business Impact</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs text-gray-500 flex items-center gap-1"><Users size={12}/> Customers affected</span>
          <input type="number" min={0} className="w-full border rounded px-3 py-2 text-sm mt-1"
            value={customers} onChange={e => setCustomers(e.target.value)}/>
        </label>
        <label className="text-sm">
          <span className="text-xs text-gray-500 flex items-center gap-1"><DollarSign size={12}/> Revenue impact (USD)</span>
          <input type="number" min={0} step="0.01" className="w-full border rounded px-3 py-2 text-sm mt-1"
            value={revenue} onChange={e => setRevenue(e.target.value)}/>
        </label>
      </div>
      <div className="flex justify-end mt-3">
        <button disabled={save.isPending} onClick={() => save.mutate()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm">
          Save
        </button>
      </div>
    </div>
  );
}
