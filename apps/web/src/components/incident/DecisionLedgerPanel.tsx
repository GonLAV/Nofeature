import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Scale, CheckCircle, XCircle, MinusCircle, RotateCcw, Plus, Clock, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

/**
 * DecisionLedgerPanel
 * ───────────────────
 * Every meaningful action becomes a *bet*: action + expected outcome + deadline.
 * When the deadline elapses we ask "did it work?" and store the answer next to
 * the original prediction. Over time, every responder accumulates a calibration
 * score — the only metric in the industry that measures *who is actually right
 * under pressure*.
 */
export interface DecisionLedgerPanelProps {
  incidentId: string;
  status?: string;
}

interface Decision {
  id: string;
  action: string;
  expected_outcome: string;
  expected_metric: string | null;
  expected_direction: 'decrease' | 'increase' | 'restore' | 'none' | null;
  confidence: number;
  status: 'pending' | 'worked' | 'failed' | 'inconclusive' | 'reverted';
  author_name: string | null;
  evaluate_at: string;
  evaluated_at: string | null;
  outcome_note: string | null;
  is_due: boolean;
  created_at: string;
}

const STATUS_STYLE: Record<Decision['status'], string> = {
  pending:      'border-blue-200    bg-blue-50',
  worked:       'border-emerald-200 bg-emerald-50',
  failed:       'border-red-200     bg-red-50',
  inconclusive: 'border-slate-200   bg-slate-50',
  reverted:     'border-amber-200   bg-amber-50',
};

const STATUS_LABEL: Record<Decision['status'], string> = {
  pending: 'awaiting verdict',
  worked: 'worked',
  failed: 'failed',
  inconclusive: 'inconclusive',
  reverted: 'reverted',
};

function formatCountdown(target: string): string {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return 'due now';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `in ${m}m ${s.toString().padStart(2, '0')}s`;
}

export default function DecisionLedgerPanel({ incidentId, status }: DecisionLedgerPanelProps) {
  const isClosed = status === 'closed';
  const qc = useQueryClient();
  const [draftOpen, setDraftOpen] = useState(false);
  const [action, setAction] = useState('');
  const [expected, setExpected] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [evalIn, setEvalIn] = useState(10);

  const { data, isLoading } = useQuery<Decision[]>({
    queryKey: ['decisions', incidentId],
    queryFn: async () => (await api.get(`/incidents/${incidentId}/decisions`)).data.data,
    refetchInterval: 15_000,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post(`/incidents/${incidentId}/decisions`, {
        action: action.trim(),
        expected_outcome: expected.trim(),
        confidence,
        evaluate_in_minutes: evalIn,
      })).data,
    onSuccess: () => {
      setAction(''); setExpected(''); setDraftOpen(false);
      qc.invalidateQueries({ queryKey: ['decisions', incidentId] });
      toast.success('Bet placed');
    },
    onError: () => toast.error('Could not place bet'),
  });

  const evaluate = useMutation({
    mutationFn: async (p: { did: string; s: 'worked' | 'failed' | 'inconclusive' | 'reverted' }) =>
      api.patch(`/decisions/${p.did}/evaluate`, { status: p.s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions', incidentId] }),
  });

  const decisions = (data ?? []).slice().sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const dueCount = decisions.filter((d) => d.is_due).length;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-slate-900 font-semibold">
          <Scale className="h-5 w-5 text-indigo-600" />
          Decision Ledger
          {decisions.length > 0 && (
            <span className="text-xs font-normal text-slate-500">
              · {decisions.length} bet{decisions.length === 1 ? '' : 's'}
            </span>
          )}
          {dueCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              <AlertCircle className="h-3 w-3" /> {dueCount} due
            </span>
          )}
        </div>
        {!isClosed && (
          <button
            onClick={() => setDraftOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" /> Place a bet
          </button>
        )}
      </div>

      {draftOpen && (
        <div className="mb-3 border border-indigo-200 rounded-md p-3 bg-indigo-50/40 space-y-2">
          <input
            value={action} onChange={(e) => setAction(e.target.value)}
            placeholder="What are you doing?  e.g. Roll back deploy f3a2"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
            maxLength={500}
          />
          <textarea
            value={expected} onChange={(e) => setExpected(e.target.value)}
            placeholder="What should happen?  e.g. Error rate drops below 1% within 5 minutes"
            rows={2}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
            maxLength={1000}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              Confidence
              <input
                type="range" min={1} max={100} value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-32"
              />
              <span className="tabular-nums w-8 text-right">{confidence}%</span>
            </label>
            <label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> evaluate in
              <select
                value={evalIn} onChange={(e) => setEvalIn(Number(e.target.value))}
                className="border border-slate-300 rounded px-1 py-0.5"
              >
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setDraftOpen(false)}
                className="px-2 py-1 rounded text-slate-600 hover:bg-slate-100"
              >Cancel</button>
              <button
                onClick={() => create.mutate()}
                disabled={action.trim().length < 3 || expected.trim().length < 3 || create.isPending}
                className="px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
              >Commit bet</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500 italic">Loading…</div>
      ) : decisions.length === 0 ? (
        <div className="text-sm text-slate-500 italic">
          No bets yet. Every fix is a hypothesis — log it here so you can prove what worked.
        </div>
      ) : (
        <ol className="space-y-2">
          {decisions.map((d) => (
            <li key={d.id} className={`border rounded-md p-3 ${STATUS_STYLE[d.status]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm leading-snug">{d.action}</div>
                <span className="text-[10px] uppercase tracking-wide text-slate-600 whitespace-nowrap">
                  {STATUS_LABEL[d.status]}
                  {d.status === 'pending' && (
                    <span className={`ml-1 ${d.is_due ? 'text-amber-700 font-semibold' : ''}`}>
                      · {d.is_due ? 'due now' : formatCountdown(d.evaluate_at)}
                    </span>
                  )}
                </span>
              </div>
              <div className="text-xs text-slate-700 mt-1">
                <span className="text-slate-500">expected:</span> {d.expected_outcome}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-2">
                {d.author_name && <span>by {d.author_name}</span>}
                <span>· {d.confidence}% confident</span>
                {d.outcome_note && <span>· note: {d.outcome_note}</span>}
              </div>

              {!isClosed && d.status === 'pending' && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => evaluate.mutate({ did: d.id, s: 'worked' })}
                    className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  ><CheckCircle className="h-3 w-3" /> It worked</button>
                  <button
                    onClick={() => evaluate.mutate({ did: d.id, s: 'failed' })}
                    className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700"
                  ><XCircle className="h-3 w-3" /> It didn't</button>
                  <button
                    onClick={() => evaluate.mutate({ did: d.id, s: 'inconclusive' })}
                    className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                  ><MinusCircle className="h-3 w-3" /> Inconclusive</button>
                  <button
                    onClick={() => evaluate.mutate({ did: d.id, s: 'reverted' })}
                    className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 text-amber-800 hover:bg-amber-100"
                  ><RotateCcw className="h-3 w-3" /> Reverted</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
