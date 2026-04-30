import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Dna, ThumbsUp, ThumbsDown, Clock, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';

interface SimilarIncident {
  id: string;
  incident_number: number | null;
  title: string;
  severity: string;
  status: string;
  resolved_at: string | null;
  ttr_minutes: number | null;
  score: number;
}

interface PlaybookStep {
  step_key: string;
  label: string;
  occurrences: number;
  total_matches: number;
  median_offset_min: number;
  evidence: string[];
  feedback_score: number;
}

interface DnaPayload {
  incident_id: string;
  fingerprint_tokens: string[];
  similar: SimilarIncident[];
  playbook: PlaybookStep[];
  expected_ttr_minutes: number | null;
  confidence: number;
  generated_at: string;
}

function formatMinutes(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function confidenceTone(c: number) {
  if (c >= 0.7) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'High' };
  if (c >= 0.4) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Moderate' };
  return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: 'Low' };
}

export default function ResolutionDnaPanel({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DnaPayload>({
    queryKey: ['dna', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/dna`).then((r) => r.data.data),
    refetchOnWindowFocus: false,
  });

  const feedback = useMutation({
    mutationFn: ({ step_key, signal }: { step_key: string; signal: 1 | -1 }) =>
      api.post(`/incidents/${incidentId}/dna/feedback`, { step_key, signal }),
    onSuccess: (_d, vars) => {
      toast.success(vars.signal === 1 ? 'Marked as helpful' : 'Marked as unhelpful');
      qc.invalidateQueries({ queryKey: ['dna', incidentId] });
    },
    onError: () => toast.error('Could not record feedback'),
  });

  const tone = useMemo(() => confidenceTone(data?.confidence ?? 0), [data?.confidence]);

  if (isLoading) {
    return (
      <div className="bg-white border rounded-xl p-4">
        <div className="text-sm text-gray-400">Computing resolution DNA…</div>
      </div>
    );
  }
  if (!data) return null;

  const hasSignal = data.similar.length > 0;

  return (
    <div className="bg-white border rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Dna size={16} className="text-fuchsia-600" />
          Resolution DNA
        </h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${tone.bg} ${tone.text} ${tone.border}`}
          title={`Confidence: ${(data.confidence * 100).toFixed(0)}%`}
        >
          {tone.label} confidence · {(data.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {!hasSignal ? (
        <div className="text-sm text-gray-500">
          Not enough resolved history yet to suggest a playbook. Resolve a few incidents and the engine
          will start surfacing what worked.
        </div>
      ) : (
        <>
          {/* Expected TTR */}
          {data.expected_ttr_minutes != null && (
            <div className="flex items-center gap-2 text-sm bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-2.5">
              <Clock size={14} className="text-fuchsia-600" />
              <span className="text-gray-700">
                Median time-to-resolve in similar past incidents:&nbsp;
                <strong className="text-fuchsia-700">{formatMinutes(data.expected_ttr_minutes)}</strong>
              </span>
            </div>
          )}

          {/* Playbook */}
          {data.playbook.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Suggested playbook (consensus from {data.similar.length} similar)
              </h4>
              <ol className="space-y-2">
                {data.playbook.map((step, i) => {
                  const ratio = step.occurrences / step.total_matches;
                  const isOpen = expandedStep === step.step_key;
                  return (
                    <li key={step.step_key} className="border rounded-lg">
                      <div className="flex items-center gap-3 p-3">
                        <div className="w-6 h-6 rounded-full bg-fuchsia-100 text-fuchsia-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{step.label}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <span>
                              {step.occurrences}/{step.total_matches} similar incidents ({(ratio * 100).toFixed(0)}%)
                            </span>
                            <span>·</span>
                            <span>≈ {formatMinutes(step.median_offset_min)} in</span>
                            {step.feedback_score !== 0 && (
                              <>
                                <span>·</span>
                                <span className={step.feedback_score > 0 ? 'text-emerald-600' : 'text-red-500'}>
                                  team signal {step.feedback_score > 0 ? '+' : ''}
                                  {step.feedback_score}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => feedback.mutate({ step_key: step.step_key, signal: 1 })}
                          disabled={feedback.isPending}
                          className="p-1.5 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition"
                          title="This step is helpful"
                          aria-label="Mark step helpful"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          onClick={() => feedback.mutate({ step_key: step.step_key, signal: -1 })}
                          disabled={feedback.isPending}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition"
                          title="This step is not helpful"
                          aria-label="Mark step unhelpful"
                        >
                          <ThumbsDown size={14} />
                        </button>
                        <button
                          onClick={() => setExpandedStep(isOpen ? null : step.step_key)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                          aria-label="Show evidence"
                        >
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="border-t bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          <div className="font-semibold mb-1 flex items-center gap-1">
                            <Activity size={12} /> Evidence
                          </div>
                          <ul className="space-y-1">
                            {step.evidence.map((eid) => {
                              const inc = data.similar.find((s) => s.id === eid);
                              return (
                                <li key={eid}>
                                  <Link to={`/incidents/${eid}`} className="text-blue-600 hover:underline">
                                    {inc?.incident_number != null ? `INC-${inc.incident_number}` : eid.slice(0, 8)}
                                  </Link>
                                  {inc && <span className="text-gray-500"> — {inc.title}</span>}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Found similar incidents but no consistent action pattern yet.
            </div>
          )}

          {/* Similar list */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Top similar incidents
            </h4>
            <ul className="space-y-1.5">
              {data.similar.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/incidents/${s.id}`}
                    className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded p-1.5"
                  >
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                      {s.incident_number != null ? `#${s.incident_number}` : s.id.slice(0, 6)}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 shrink-0">{s.severity}</span>
                    <span className="truncate flex-1">{s.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {(s.score * 100).toFixed(0)}%
                    </span>
                    {s.resolved_at && (
                      <span className="text-xs text-gray-400 shrink-0 hidden md:inline">
                        · {formatDistanceToNow(new Date(s.resolved_at), { addSuffix: true })}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
