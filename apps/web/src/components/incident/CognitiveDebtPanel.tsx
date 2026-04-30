import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';

interface DebtItem {
  id: string;
  category: string;
  title: string;
  description: string | null;
  surface: number;
  principal: number;
  severityAtDeclaration: string;
  declaredAt: string;
  repaidAt: string | null;
  repaymentUrl: string | null;
  repaymentNote: string | null;
  accrued: number;
  total: number;
  ratePerYear: number;
  ageDays: number;
  capped: boolean;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'rate_limit_raised',    label: 'Rate limit raised' },
  { value: 'feature_flag_flipped', label: 'Feature flag flipped' },
  { value: 'retry_added',          label: 'Retry added' },
  { value: 'capacity_scaled',      label: 'Capacity scaled' },
  { value: 'alert_silenced',       label: 'Alert silenced' },
  { value: 'monkey_patch',         label: 'Monkey patch' },
  { value: 'config_override',      label: 'Config override' },
  { value: 'data_repaired',        label: 'Data repaired' },
  { value: 'rollback',             label: 'Rollback' },
  { value: 'other',                label: 'Other' },
];

export default function CognitiveDebtPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['debt', incidentId],
    queryFn:  async () => {
      const res = await api.get<{ data: DebtItem[] }>(`/incidents/${incidentId}/debt`);
      return res.data.data;
    },
    refetchInterval: 60_000,
  });

  const [open,        setOpen]        = useState(false);
  const [category,    setCategory]    = useState('monkey_patch');
  const [title,       setTitle]       = useState('');
  const [surface,     setSurface]     = useState(2);
  const [principal,   setPrincipal]   = useState(3);
  const [description, setDescription] = useState('');

  const declare = useMutation({
    mutationFn: async () =>
      api.post(`/incidents/${incidentId}/debt`, {
        category, title, surface, principal,
        description: description || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setDescription('');
      qc.invalidateQueries({ queryKey: ['debt', incidentId] });
    },
  });

  const [repayingId,    setRepayingId]    = useState<string | null>(null);
  const [repayUrl,      setRepayUrl]      = useState('');
  const [repayNote,     setRepayNote]     = useState('');

  const repay = useMutation({
    mutationFn: async (debtId: string) =>
      api.post(`/debt/${debtId}/repay`, {
        repaymentUrl:  repayUrl  || undefined,
        repaymentNote: repayNote || undefined,
      }),
    onSuccess: () => {
      setRepayingId(null);
      setRepayUrl('');
      setRepayNote('');
      qc.invalidateQueries({ queryKey: ['debt', incidentId] });
    },
  });

  const items = data ?? [];
  const openItems   = items.filter((i) => !i.repaidAt);
  const repaidItems = items.filter((i) =>  i.repaidAt);

  const totalOutstanding = openItems.reduce((s, i) => s + i.total, 0);
  const totalPrincipal   = openItems.reduce((s, i) => s + i.principal, 0);
  const totalAccrued     = openItems.reduce((s, i) => s + i.accrued, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Cognitive Debt Ledger</h2>
          <p className="text-sm text-gray-500">
            Shortcuts taken to stop the bleeding. They accrue interest until you link the real fix.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
        >
          {open ? 'Cancel' : 'Declare debt'}
        </button>
      </div>

      {!isLoading && openItems.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-amber-50 rounded p-3">
            <div className="text-xs uppercase text-amber-700">Outstanding</div>
            <div className="text-xl font-bold text-amber-900">
              {totalOutstanding.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-xs uppercase text-gray-600">Principal</div>
            <div className="text-xl font-bold text-gray-900">
              {totalPrincipal.toFixed(2)}
            </div>
          </div>
          <div className="bg-red-50 rounded p-3">
            <div className="text-xs uppercase text-red-700">Accrued interest</div>
            <div className="text-xl font-bold text-red-900">
              {totalAccrued.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="border rounded p-3 mb-4 bg-amber-50/40 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Surface (1–5)</span>
              <input
                type="number" min={1} max={5}
                value={surface}
                onChange={(e) => setSurface(Number(e.target.value))}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Principal (1–10)</span>
              <input
                type="number" min={0} max={100} step={0.5}
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value))}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-sm col-span-2">
              <span className="block text-gray-700 mb-1">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bumped /search rate limit 5x to keep checkout alive"
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="text-sm col-span-2">
              <span className="block text-gray-700 mb-1">Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <button
            disabled={!title || declare.isPending}
            onClick={() => declare.mutate()}
            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white disabled:bg-gray-300"
          >
            {declare.isPending ? 'Recording…' : 'Add to ledger'}
          </button>
        </div>
      )}

      {isLoading && <div className="text-sm text-gray-500">Loading…</div>}

      {!isLoading && items.length === 0 && (
        <div className="text-sm text-gray-500 italic">
          No shortcuts declared yet. The honest answer is rarely zero — add what you patched in chat.
        </div>
      )}

      {openItems.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase text-gray-500">Open</div>
          {openItems.map((item) => (
            <div key={item.id} className="border-l-4 border-amber-500 bg-white pl-3 py-2 rounded shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {item.category.replace(/_/g, ' ')} · surface {item.surface} · {item.severityAtDeclaration} · {Math.round(item.ageDays)} days old
                  </div>
                  {item.description && (
                    <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                  )}
                </div>
                <div className="text-right ml-3">
                  <div className="text-sm font-bold text-amber-900">{item.total.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">+{item.accrued.toFixed(2)} interest</div>
                  {item.capped && (
                    <div className="text-[10px] text-red-600 font-semibold">CAPPED</div>
                  )}
                </div>
              </div>

              {repayingId === item.id ? (
                <div className="mt-2 space-y-1">
                  <input
                    value={repayUrl}
                    onChange={(e) => setRepayUrl(e.target.value)}
                    placeholder="Repayment URL (PR / runbook / ticket)"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                  <input
                    value={repayNote}
                    onChange={(e) => setRepayNote(e.target.value)}
                    placeholder="What actually fixed it?"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={repay.isPending}
                      onClick={() => repay.mutate(item.id)}
                      className="px-2 py-1 text-xs rounded bg-green-600 text-white disabled:bg-gray-300"
                    >
                      {repay.isPending ? 'Repaying…' : 'Confirm repayment'}
                    </button>
                    <button
                      onClick={() => setRepayingId(null)}
                      className="px-2 py-1 text-xs rounded border"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setRepayingId(item.id)}
                  className="mt-2 text-xs text-green-700 hover:underline"
                >
                  Mark repaid →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {repaidItems.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-xs font-semibold uppercase text-gray-500">Repaid</div>
          {repaidItems.map((item) => (
            <div key={item.id} className="text-xs text-gray-600 flex justify-between border-l-4 border-green-400 pl-2 py-1">
              <span className="line-through">{item.title}</span>
              <span className="text-green-700">
                {item.repaymentUrl ? (
                  <a href={item.repaymentUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    repaid
                  </a>
                ) : 'repaid'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
