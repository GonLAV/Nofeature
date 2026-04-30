import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lightbulb, ThumbsUp, ThumbsDown, CheckCircle, XCircle, Plus, Trophy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

/**
 * HypothesisTrackerPanel
 * ──────────────────────
 * First-class hypothesis tracking. Every theory ("DB pool exhausted?",
 * "bad deploy?") becomes a structured object the room can vote on,
 * attach evidence to, and finally mark as the confirmed root cause.
 *
 * Why this is novel: every other tool treats hypotheses as chat
 * messages that scroll away. We pin them, score them, and turn the
 * postmortem question "how long did we chase the wrong theory?" into
 * actual data.
 */
export interface HypothesisTrackerPanelProps {
  incidentId: string;
  status?: string;
}

interface Hypothesis {
  id: string;
  title: string;
  description: string | null;
  author_name: string | null;
  status: 'investigating' | 'confirmed' | 'refuted' | 'superseded';
  up_votes: number;
  down_votes: number;
  supports: number;
  contradicts: number;
  context_evidence: number;
  my_vote: number | null;
  created_at: string;
  scoring: {
    score: number;
    label: 'leading' | 'plausible' | 'weak' | 'rejected' | 'confirmed';
    hours_idle: number;
  };
}

const LABEL_STYLE: Record<Hypothesis['scoring']['label'], string> = {
  leading:   'bg-emerald-50 border-emerald-300 text-emerald-800',
  plausible: 'bg-blue-50    border-blue-300    text-blue-800',
  weak:      'bg-slate-50   border-slate-300   text-slate-600',
  rejected:  'bg-red-50     border-red-300     text-red-700 line-through',
  confirmed: 'bg-amber-50   border-amber-400   text-amber-900',
};

export default function HypothesisTrackerPanel({ incidentId, status }: HypothesisTrackerPanelProps) {
  const isClosed = status === 'closed';
  const qc = useQueryClient();
  const [draftOpen, setDraftOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  const { data, isLoading } = useQuery<Hypothesis[]>({
    queryKey: ['hypotheses', incidentId],
    queryFn: async () => (await api.get(`/incidents/${incidentId}/hypotheses`)).data.data,
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post(`/incidents/${incidentId}/hypotheses`, {
        title: title.trim(),
        description: desc.trim() || null,
      })).data,
    onSuccess: () => {
      setTitle(''); setDesc(''); setDraftOpen(false);
      qc.invalidateQueries({ queryKey: ['hypotheses', incidentId] });
      toast.success('Hypothesis posted');
    },
    onError: () => toast.error('Could not post hypothesis'),
  });

  const vote = useMutation({
    mutationFn: async (p: { hid: string; v: 1 | -1 | 0 }) =>
      api.post(`/hypotheses/${p.hid}/vote`, { vote: p.v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', incidentId] }),
  });

  const setStatus = useMutation({
    mutationFn: async (p: { hid: string; s: Hypothesis['status'] }) =>
      api.patch(`/hypotheses/${p.hid}/status`, { status: p.s }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['hypotheses', incidentId] });
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      if (vars.s === 'confirmed') toast.success('Marked as confirmed root cause');
    },
  });

  const sorted = (data ?? [])
    .slice()
    .sort((a, b) => b.scoring.score - a.scoring.score);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-slate-900 font-semibold">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Hypothesis Tracker
          {sorted.length > 0 && (
            <span className="text-xs font-normal text-slate-500">
              · {sorted.length} theor{sorted.length === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>
        {!isClosed && (
          <button
            onClick={() => setDraftOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" /> New theory
          </button>
        )}
      </div>

      {draftOpen && (
        <div className="mb-3 border border-slate-200 rounded-md p-3 bg-slate-50">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Connection pool exhausted in checkout-svc"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 mb-2"
            maxLength={200}
          />
          <textarea
            value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional details — what would prove or disprove this?"
            rows={2}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 mb-2"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDraftOpen(false)}
              className="text-xs px-2 py-1 rounded-md text-slate-600 hover:bg-slate-200"
            >Cancel</button>
            <button
              onClick={() => create.mutate()}
              disabled={title.trim().length < 3 || create.isPending}
              className="text-xs px-2 py-1 rounded-md bg-emerald-600 text-white disabled:opacity-50"
            >Post hypothesis</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500 italic">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="text-sm text-slate-500 italic">
          No hypotheses yet. Post the first theory to align the room.
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((h, idx) => (
            <li
              key={h.id}
              className={`border rounded-md p-3 ${LABEL_STYLE[h.scoring.label]} flex gap-3`}
            >
              <div className="flex flex-col items-center gap-1 min-w-[44px]">
                <button
                  onClick={() => vote.mutate({ hid: h.id, v: h.my_vote === 1 ? 0 : 1 })}
                  className={`p-1 rounded hover:bg-white/60 ${h.my_vote === 1 ? 'text-emerald-700' : 'text-slate-500'}`}
                  aria-label="Support"
                  disabled={isClosed || h.status !== 'investigating'}
                >
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <span className="text-xs font-bold tabular-nums">
                  {h.up_votes - h.down_votes >= 0 ? '+' : ''}{h.up_votes - h.down_votes}
                </span>
                <button
                  onClick={() => vote.mutate({ hid: h.id, v: h.my_vote === -1 ? 0 : -1 })}
                  className={`p-1 rounded hover:bg-white/60 ${h.my_vote === -1 ? 'text-red-700' : 'text-slate-500'}`}
                  aria-label="Doubt"
                  disabled={isClosed || h.status !== 'investigating'}
                >
                  <ThumbsDown className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium leading-snug flex items-center gap-1.5">
                    {idx === 0 && h.scoring.label === 'leading' && (
                      <Trophy className="h-3.5 w-3.5 text-amber-600" />
                    )}
                    {h.title}
                  </div>
                  <span className="text-[10px] uppercase tracking-wide opacity-70">
                    {h.scoring.label} · {h.scoring.score}
                  </span>
                </div>
                {h.description && (
                  <div className="text-xs opacity-80 mt-1">{h.description}</div>
                )}
                <div className="text-[11px] mt-1.5 opacity-70 flex flex-wrap gap-2">
                  {h.author_name && <span>by {h.author_name}</span>}
                  <span>· {h.supports} supporting</span>
                  <span>· {h.contradicts} contradicting</span>
                  {h.scoring.hours_idle > 1 && (
                    <span>· idle {Math.round(h.scoring.hours_idle)}h</span>
                  )}
                </div>

                {!isClosed && h.status === 'investigating' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setStatus.mutate({ hid: h.id, s: 'confirmed' })}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <CheckCircle className="h-3 w-3" /> Mark as cause
                    </button>
                    <button
                      onClick={() => setStatus.mutate({ hid: h.id, s: 'refuted' })}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                      <XCircle className="h-3 w-3" /> Refute
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
