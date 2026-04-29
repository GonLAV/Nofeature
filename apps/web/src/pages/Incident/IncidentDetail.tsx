import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Clock, AlertTriangle, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';
import { useIncidentStream, WREvent } from '../../hooks/useIncidentStream';
import WarRoomChat from '../../components/WarRoomChat';
import { useStreamingAI } from '../../components/StreamingAIPanel';

const STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'closed'];

interface TimelineEntry {
  id: string;
  action: string;
  created_at: string;
  user_name?: string;
  metadata?: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface Analysis {
  rootCause?: string;
  immediateActions?: string[];
  whoToPage?: string[];
  estimatedImpact?: string;
  preventionSteps?: string[];
}

interface IncidentData {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  created_at: string;
  resolved_at?: string;
  ai_root_cause?: string;
  ai_summary?: string;
  ai_action_items?: { immediate?: string[]; whoToPage?: string[] } | null;
  timeline: TimelineEntry[];
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  // Live SSE state
  const [liveMessage, setLiveMessage] = useState<ChatMessage | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const [presence, setPresence] = useState<{ userId: string; userName: string; online: boolean }[]>([]);
  const [liveAiBuffer, setLiveAiBuffer] = useState('');
  const [liveAiComplete, setLiveAiComplete] = useState<Analysis | null>(null);

  const handleSSEEvent = useCallback((event: WREvent) => {
    switch (event.type) {
      case 'incident_updated':
        qc.invalidateQueries({ queryKey: ['incident', id] });
        break;
      case 'timeline_entry':
        setLiveTimeline(prev => {
          const entry = event.payload as TimelineEntry;
          if (prev.some(e => e.id === entry.id)) return prev;
          return [...prev, entry];
        });
        break;
      case 'message':
        setLiveMessage(event.payload as ChatMessage);
        break;
      case 'ai_token':
        // Accumulate tokens from OTHER users triggering analysis via SSE broadcast
        // (the local triggerStream path updates its own `buffer` independently)
        if (!streaming) {
          setLiveAiBuffer(prev => prev + (event.payload as { text: string }).text);
        }
        break;
      case 'ai_complete':
        setLiveAiComplete(event.payload as Analysis);
        setLiveAiBuffer('');
        qc.invalidateQueries({ queryKey: ['incident', id] });
        toast.success('AI analysis complete');
        break;
      case 'presence':
        {
          const p = event.payload as { userId: string; userName: string; online: boolean };
          setPresence(prev => {
            const filtered = prev.filter(x => x.userId !== p.userId);
            return p.online ? [...filtered, p] : filtered;
          });
        }
        break;
    }
  }, [id, qc]);

  useIncidentStream(id!, handleSSEEvent);

  const { data, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.get(`/incidents/${id}`).then(r => r.data.data),
    // Reduced to 60s — SSE handles real-time; this is just a safety net
    refetchInterval: 60_000,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/incidents/${id}/status`, { status }),
    onSuccess: () => toast.success('Status updated'),
    onError: () => toast.error('Failed to update status'),
  });

  const postmortemMutation = useMutation({
    mutationFn: () => api.get(`/ai/incidents/${id}/postmortem`).then(r => r.data.data.report),
    onSuccess: (report) => {
      const blob = new Blob([report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `postmortem-${id}.md`; a.click();
      toast.success('Post-mortem downloaded');
    },
  });

  const { trigger: triggerStream, streaming, buffer, analysis: streamAnalysis } = useStreamingAI(id!);

  if (isLoading) return <div className="p-6 text-gray-400">Loading incident…</div>;
  if (!data) return <div className="p-6 text-red-500">Incident not found</div>;

  const incident = data as IncidentData;
  const savedActions = incident.ai_action_items;

  // Merge persisted timeline with live entries
  const allTimeline: TimelineEntry[] = [
    ...(incident.timeline ?? []),
    ...liveTimeline.filter(lt => !(incident.timeline ?? []).some((t: TimelineEntry) => t.id === lt.id)),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Determine which analysis to show
  const displayAnalysis = streamAnalysis ?? liveAiComplete;
  const displayRootCause = displayAnalysis?.rootCause ?? incident.ai_root_cause;
  const displayActions = displayAnalysis?.immediateActions ?? savedActions?.immediate;
  const displayWhoToPage = displayAnalysis?.whoToPage ?? savedActions?.whoToPage;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-1 rounded border ${
                incident.severity === 'P1' ? 'bg-red-100 text-red-800 border-red-200' :
                incident.severity === 'P2' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                'bg-yellow-100 text-yellow-800 border-yellow-200'
              }`}>{incident.severity}</span>
              <span className="text-sm text-gray-500 capitalize">{incident.status}</span>
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
              </span>

              {/* Live presence badges */}
              {presence.length > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  <Radio size={12} className="text-green-500 animate-pulse" />
                  {presence.map(p => (
                    <span key={p.userId}
                      className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      {p.userName}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <h1 className="text-xl font-semibold">{incident.title}</h1>
            <p className="text-gray-600 mt-2 text-sm">{incident.description}</p>
          </div>

          <div className="flex flex-col gap-2 min-w-36">
            <select value={incident.status}
              onChange={e => statusMutation.mutate(e.target.value)}
              disabled={statusMutation.isPending}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50">
              {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>

            <button
              onClick={triggerStream}
              disabled={streaming}
              className="flex items-center justify-center gap-1 bg-purple-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors">
              <Zap size={14} />
              {streaming ? 'Analyzing…' : 'AI Analyze'}
            </button>

            {incident.status === 'resolved' && (
              <button onClick={() => postmortemMutation.mutate()}
                disabled={postmortemMutation.isPending}
                className="flex items-center justify-center gap-1 border rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors">
                {postmortemMutation.isPending ? 'Generating…' : 'Post-mortem'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {(streaming || buffer || liveAiBuffer || displayRootCause) && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-purple-700 font-medium">
            <Zap size={16} />
            <span>AI Analysis</span>
            {(streaming || liveAiBuffer) && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-purple-500 animate-pulse">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400" />
                thinking…
              </span>
            )}
          </div>

          {/* Streaming raw buffer — local trigger or SSE observer */}
          {(streaming || buffer || liveAiBuffer) && !streamAnalysis && !liveAiComplete && (
            <pre className="text-xs text-purple-800 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
              {buffer || liveAiBuffer}
              {(streaming || liveAiBuffer) && <span className="animate-pulse">▍</span>}
            </pre>
          )}

          {displayRootCause && (
            <div>
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Root Cause</div>
              <p className="text-sm text-purple-900">{displayRootCause}</p>
            </div>
          )}

          {displayActions && displayActions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Immediate Actions</div>
              <ul className="space-y-1">
                {displayActions.map((a: string, i: number) => (
                  <li key={i} className="text-sm text-purple-900 flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">→</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {displayWhoToPage && displayWhoToPage.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Who to Page</div>
              <div className="flex flex-wrap gap-1">
                {displayWhoToPage.map((r: string) => (
                  <span key={r}
                    className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline + Chat side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock size={16} /> Timeline
            <span className="ml-auto text-xs text-gray-400">{allTimeline.length} events</span>
          </h2>
          {allTimeline.length === 0 ? (
            <p className="text-sm text-gray-400">No timeline entries yet</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {allTimeline.map((entry: TimelineEntry) => (
                <div key={entry.id} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
                    <div className="flex-1 w-px bg-gray-100" />
                  </div>
                  <div className="pb-3 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-700 truncate">
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      {entry.user_name && (
                        <span className="text-gray-400 text-xs flex-shrink-0">
                          by {entry.user_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* War Room Chat */}
        <WarRoomChat incidentId={id!} liveMessage={liveMessage} />
      </div>

      {/* Affected Systems */}
      {(incident as unknown as { affected_systems?: string[] }).affected_systems?.length ? (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Affected Systems
          </h2>
          <div className="flex flex-wrap gap-2">
            {(incident as unknown as { affected_systems: string[] }).affected_systems.map((s: string) => (
              <span key={s} className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-full">
                {s}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
