import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Clock, User, AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';
import IncidentChat from '../../components/incident/IncidentChat';
import IncidentLinks from '../../components/incident/IncidentLinks';
import SimilarIncidents from '../../components/incident/SimilarIncidents';
import CustomerImpactPanel from '../../components/incident/CustomerImpactPanel';
import LinkedIncidentsPanel from '../../components/incident/LinkedIncidentsPanel';
import ExportButtons from '../../components/incident/ExportButtons';
import CommentsPanel from '../../components/incident/CommentsPanel';
import TagsPanel from '../../components/incident/TagsPanel';
import PresenceIndicator from '../../components/incident/PresenceIndicator';
import SlaBadge from '../../components/incident/SlaBadge';
import ActionItemsPanel from '../../components/incident/ActionItemsPanel';
import RelatedIncidentsPanel from '../../components/incident/RelatedIncidentsPanel';
import PostmortemPanel from '../../components/incident/PostmortemPanel';
import WatchButton from '../../components/incident/WatchButton';
import IncidentServices from '../../components/incident/IncidentServices';
import StatusUpdatesPanel from '../../components/incident/StatusUpdatesPanel';
import IncidentLinksPanel from '../../components/incident/IncidentLinksPanel';
import ShareLinksPanel from '../../components/incident/ShareLinksPanel';
import CloneButton from '../../components/incident/CloneButton';
import SlashCommandBar from '../../components/incident/SlashCommandBar';

const STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'closed'];

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.get(`/incidents/${id}`).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/incidents/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incident', id] }); toast.success('Status updated'); },
  });

  const ackMutation = useMutation({
    mutationFn: () => api.post(`/incidents/${id}/acknowledge`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incident', id] }); qc.invalidateQueries({ queryKey: ['sla', id] }); toast.success('Acknowledged'); },
  });

  const analyzeMutation = useMutation({
    mutationFn: () => api.post(`/ai/incidents/${id}/analyze`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incident', id] }); toast.success('AI analysis complete'); },
    onError: () => toast.error('AI analysis failed'),
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

  if (isLoading) return <div className="p-6 text-gray-400">Loading incident...</div>;
  if (!data) return <div className="p-6 text-red-500">Incident not found</div>;

  const incident = data;
  const actionItems = incident.ai_action_items as { immediate?: string[]; prevention?: string[]; whoToPage?: string[] } | null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-1 rounded border ${
                incident.severity === 'P1' ? 'bg-red-100 text-red-800 border-red-200' :
                incident.severity === 'P2' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                'bg-yellow-100 text-yellow-800 border-yellow-200'
              }`}>{incident.severity}</span>
              <span className="text-sm text-gray-500 capitalize">{incident.status}</span>
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
              </span>
            </div>
            <h1 className="text-xl font-semibold">{incident.title}</h1>
            <p className="text-gray-600 mt-2 text-sm">{incident.description}</p>
          </div>
          <div className="flex flex-col gap-2 min-w-32">
            <select value={incident.status}
              onChange={e => statusMutation.mutate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            <button onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="flex items-center justify-center gap-1 bg-purple-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-purple-700 disabled:opacity-50">
              <Zap size={14} />{analyzeMutation.isPending ? 'Analyzing...' : 'AI Analyze'}
            </button>
            {incident.status === 'resolved' && (
              <button onClick={() => postmortemMutation.mutate()}
                disabled={postmortemMutation.isPending}
                className="flex items-center justify-center gap-1 border rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50">
                {postmortemMutation.isPending ? 'Generating...' : 'Post-mortem'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {(incident.ai_root_cause || incident.ai_summary) && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3 text-purple-700 font-medium">
            <Zap size={16} /> AI Analysis
          </div>
          {incident.ai_root_cause && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Root Cause</div>
              <p className="text-sm text-purple-900">{incident.ai_root_cause}</p>
            </div>
          )}
          {actionItems?.immediate && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Immediate Actions</div>
              <ul className="space-y-1">
                {actionItems.immediate.map((a: string, i: number) => (
                  <li key={i} className="text-sm text-purple-900 flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">→</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {actionItems?.whoToPage && (
            <div>
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Who to Page</div>
              <div className="flex flex-wrap gap-1">
                {actionItems.whoToPage.map((r: string) => (
                  <span key={r} className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <User size={10} /> {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Clock size={16} /> Timeline</h2>
        {(!incident.timeline || incident.timeline.length === 0) ? (
          <p className="text-sm text-gray-400">No timeline entries yet</p>
        ) : (
          <div className="space-y-3">
            {incident.timeline.map((entry: { id: string; action: string; created_at: string; user_name?: string; metadata?: Record<string, unknown> }) => (
              <div key={entry.id} className="flex gap-3 text-sm">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5" />
                  <div className="flex-1 w-px bg-gray-100" />
                </div>
                <div className="pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{entry.action.replace(/_/g, ' ')}</span>
                    {entry.user_name && <span className="text-gray-400 text-xs">by {entry.user_name}</span>}
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
      {id && <IncidentLinks incidentId={id} />}
      {id && <SlaBadge incidentId={id} canAck={!incident.acknowledged_at && incident.status !== 'closed'} onAcknowledge={() => ackMutation.mutate()}/>}
      {id && <div><WatchButton incidentId={id} /></div>}
      {id && <IncidentServices incidentId={id} />}
      {id && <StatusUpdatesPanel incidentId={id} />}
      {id && <IncidentLinksPanel incidentId={id} />}
      {id && <ShareLinksPanel incidentId={id} />}
      {id && <SlashCommandBar incidentId={id} />}
      {id && <div><CloneButton incidentId={id} /></div>}
      {id && <PresenceIndicator incidentId={id} />}
      {id && <TagsPanel incidentId={id} />}
      {id && <CommentsPanel incidentId={id} />}
      {id && <ActionItemsPanel incidentId={id} />}
      {id && <RelatedIncidentsPanel incidentId={id} />}
      {id && <PostmortemPanel incidentId={id} />}
      {id && <LinkedIncidentsPanel incidentId={id} />}
      {id && incident && (
        <CustomerImpactPanel
          incidentId={id}
          customers_affected={incident.customers_affected}
          revenue_impact_usd={incident.revenue_impact_usd}
        />
      )}
      {id && <ExportButtons incidentId={id} />}
      {id && <SimilarIncidents incidentId={id} />}
      {id && <IncidentChat incidentId={id} />}
    </div>
  );
}
