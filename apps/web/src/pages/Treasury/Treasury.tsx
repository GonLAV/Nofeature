import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';

interface AccountView {
  budget:         number;
  balance:        number;
  burn:           number;
  runway:         number;
  recommendation: 'healthy' | 'caution' | 'freeze';
  reason:         string;
  utilization:    number;
}

interface Account {
  id:               string;
  service_name:     string;
  slo_target:       number;
  window_days:      number;
  budget_minutes:   number;
  balance_minutes:  number;
  view:             AccountView;
}

interface Dashboard {
  accounts:     Account[];
  totalBudget:  number;
  totalBalance: number;
  totalBurn:    number;
  worstRunway:  number | null;
  freezeCount:  number;
  cautionCount: number;
}

const fmtMin = (m: number) => `${m.toFixed(1)} min`;
const fmtRunway = (d: number | null | undefined) =>
  d == null ? '—'
    : !Number.isFinite(d) ? '∞'
    : `${d.toFixed(1)} d`;

const statusColor = (s: 'healthy' | 'caution' | 'freeze') =>
  s === 'freeze'  ? 'bg-red-100 text-red-800 border-red-300'
: s === 'caution' ? 'bg-amber-100 text-amber-800 border-amber-300'
:                   'bg-green-100 text-green-800 border-green-300';

export default function ReliabilityTreasury() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['treasury'],
    queryFn:  async () => {
      const res = await api.get<{ data: Dashboard }>('/treasury/dashboard');
      return res.data.data;
    },
    refetchInterval: 30_000,
  });

  const [showForm, setShowForm]       = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [sloTarget, setSloTarget]     = useState(0.999);
  const [windowDays, setWindowDays]   = useState(30);

  const create = useMutation({
    mutationFn: async () => api.post('/treasury/accounts', { serviceName, sloTarget, windowDays }),
    onSuccess: () => {
      setShowForm(false);
      setServiceName('');
      qc.invalidateQueries({ queryKey: ['treasury'] });
    },
  });

  const [txAccountId, setTxAccountId] = useState<string | null>(null);
  const [txKind, setTxKind]           = useState<'withdraw' | 'deposit'>('withdraw');
  const [txMinutes, setTxMinutes]     = useState(1);
  const [txNote, setTxNote]           = useState('');

  const tx = useMutation({
    mutationFn: async () =>
      api.post(`/treasury/accounts/${txAccountId}/${txKind}`, {
        minutes: txMinutes, note: txNote || undefined,
      }),
    onSuccess: () => {
      setTxAccountId(null);
      setTxNote('');
      setTxMinutes(1);
      qc.invalidateQueries({ queryKey: ['treasury'] });
    },
  });

  if (isLoading || !data) {
    return <div className="p-6 text-gray-500">Loading reliability treasury…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reliability Treasury</h1>
          <p className="text-sm text-gray-500">
            Error budget as a checking account. Withdrawals during incidents, deposits for caught near-misses, interest for clean weeks.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Open account'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs uppercase text-gray-500">Total balance</div>
          <div className="text-2xl font-bold">{fmtMin(data.totalBalance)}</div>
          <div className="text-xs text-gray-400">budget {fmtMin(data.totalBudget)}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs uppercase text-gray-500">Burn rate (7d)</div>
          <div className="text-2xl font-bold">{data.totalBurn.toFixed(2)}</div>
          <div className="text-xs text-gray-400">min / day</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs uppercase text-gray-500">Worst runway</div>
          <div className="text-2xl font-bold">{fmtRunway(data.worstRunway)}</div>
          <div className="text-xs text-gray-400">across all services</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs uppercase text-gray-500">Alerts</div>
          <div className="text-2xl font-bold">
            <span className="text-red-700">{data.freezeCount}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-amber-700">{data.cautionCount}</span>
          </div>
          <div className="text-xs text-gray-400">freeze / caution</div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded shadow p-4 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Service name</span>
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="checkout-api"
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">SLO target</span>
              <input
                type="number" min={0.5} max={0.99999} step={0.0001}
                value={sloTarget}
                onChange={(e) => setSloTarget(Number(e.target.value))}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Window (days)</span>
              <input
                type="number" min={1} max={365}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <button
            disabled={!serviceName || create.isPending}
            onClick={() => create.mutate()}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:bg-gray-300"
          >
            {create.isPending ? 'Opening…' : 'Open account'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {data.accounts.length === 0 && (
          <div className="bg-white rounded shadow p-6 text-center text-gray-500">
            No treasury accounts yet. Open one for a critical service to start tracking.
          </div>
        )}
        {data.accounts.map((acc) => (
          <div key={acc.id} className="bg-white rounded shadow p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{acc.service_name}</div>
                <div className="text-xs text-gray-500">
                  SLO {(acc.slo_target * 100).toFixed(3)}% over {acc.window_days}d — budget {fmtMin(acc.budget_minutes)}
                </div>
              </div>
              <div className={`text-xs font-semibold uppercase px-2 py-1 border rounded ${statusColor(acc.view.recommendation)}`}>
                {acc.view.recommendation}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-500">Balance</div>
                <div className="font-bold">{fmtMin(acc.view.balance)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Burn / day</div>
                <div className="font-bold">{acc.view.burn.toFixed(2)} min</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Runway</div>
                <div className="font-bold">{fmtRunway(acc.view.runway)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Utilization</div>
                <div className="font-bold">{(acc.view.utilization * 100).toFixed(1)}%</div>
              </div>
            </div>

            <div className="mt-2 h-2 bg-gray-100 rounded overflow-hidden">
              <div
                className={
                  acc.view.recommendation === 'freeze'  ? 'h-full bg-red-500'
                : acc.view.recommendation === 'caution' ? 'h-full bg-amber-500'
                :                                          'h-full bg-green-500'
                }
                style={{ width: `${Math.min(100, acc.view.utilization * 100)}%` }}
              />
            </div>

            <div className="mt-2 text-xs text-gray-600 italic">{acc.view.reason}</div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { setTxAccountId(acc.id); setTxKind('withdraw'); }}
                className="px-2 py-1 text-xs rounded border hover:bg-red-50 text-red-700"
              >
                Withdraw
              </button>
              <button
                onClick={() => { setTxAccountId(acc.id); setTxKind('deposit'); }}
                className="px-2 py-1 text-xs rounded border hover:bg-green-50 text-green-700"
              >
                Deposit
              </button>
            </div>

            {txAccountId === acc.id && (
              <div className="mt-3 border-t pt-2 space-y-1">
                <div className="text-xs font-semibold uppercase">
                  {txKind === 'withdraw' ? 'Withdraw budget minutes' : 'Deposit budget minutes'}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number" min={0.1} step={0.1}
                    value={txMinutes}
                    onChange={(e) => setTxMinutes(Number(e.target.value))}
                    className="border rounded px-2 py-1 text-xs w-24"
                  />
                  <input
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                    placeholder="Note (incident link, near-miss reason, etc.)"
                    className="border rounded px-2 py-1 text-xs flex-1"
                  />
                  <button
                    disabled={tx.isPending}
                    onClick={() => tx.mutate()}
                    className="px-2 py-1 text-xs rounded bg-blue-600 text-white disabled:bg-gray-300"
                  >
                    {tx.isPending ? 'Posting…' : 'Post'}
                  </button>
                  <button
                    onClick={() => setTxAccountId(null)}
                    className="px-2 py-1 text-xs rounded border"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
