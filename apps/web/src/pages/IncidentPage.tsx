import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

interface TimelineEvent {
  id: string
  type: string
  message: string
  createdAt: string
  author?: { firstName: string; lastName: string }
}

interface AiAnalysis {
  rootCause?: string
  summary?: string
  recommendations?: string[]
  createdAt?: string
}

interface Incident {
  id: string
  title: string
  severity: string
  status: string
  description?: string
  commander?: { id: string; firstName: string; lastName: string }
  timeline?: TimelineEvent[]
  aiAnalysis?: AiAnalysis
  createdAt: string
  resolvedAt?: string
}

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [aiLoading, setAiLoading] = useState(false)
  const [postMortemLoading, setPostMortemLoading] = useState(false)
  const [postMortem, setPostMortem] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: incident, isLoading } = useQuery<Incident>({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/incidents/${id}`)
      return res.data
    },
    enabled: !!id,
  })

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/api/v1/incidents/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incident', id] }),
  })

  const handleAiAnalysis = async () => {
    setAiLoading(true)
    setError('')
    try {
      await api.post(`/api/v1/incidents/${id}/analyze`)
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
    } catch {
      setError('AI analysis failed. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  const handlePostMortem = async () => {
    setPostMortemLoading(true)
    setError('')
    try {
      const res = await api.post(`/api/v1/incidents/${id}/post-mortem`)
      setPostMortem(res.data.content ?? JSON.stringify(res.data, null, 2))
    } catch {
      setError('Failed to generate post-mortem.')
    } finally {
      setPostMortemLoading(false)
    }
  }

  const statuses = ['open', 'investigating', 'mitigating', 'resolved', 'closed']

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading incident...</div>
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="text-center py-12 text-gray-500">Incident not found.</div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <Badge type="severity" value={incident.severity} />
            <Badge type="status" value={incident.status} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{incident.title}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Created: {new Date(incident.createdAt).toLocaleString()}
            {incident.resolvedAt && ` · Resolved: ${new Date(incident.resolvedAt).toLocaleString()}`}
          </p>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            loading={aiLoading}
            onClick={handleAiAnalysis}
          >
            🤖 AI Analysis
          </Button>
          {(incident.status === 'resolved' || incident.status === 'closed') && (
            <Button
              variant="secondary"
              size="sm"
              loading={postMortemLoading}
              onClick={handlePostMortem}
            >
              📄 Generate Post-Mortem
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Description */}
      {incident.description && (
        <Card title="Description">
          <p className="text-gray-700 whitespace-pre-wrap">{incident.description}</p>
        </Card>
      )}

      {/* Status + Commander */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Update Status">
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => updateStatusMutation.mutate(s)}
                disabled={incident.status === s || updateStatusMutation.isPending}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  incident.status === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Commander">
          {incident.commander ? (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-medium">
                {incident.commander.firstName[0]}{incident.commander.lastName[0]}
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {incident.commander.firstName} {incident.commander.lastName}
                </p>
                <p className="text-xs text-gray-500">Incident Commander</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No commander assigned</p>
          )}
        </Card>
      </div>

      {/* AI Analysis */}
      {incident.aiAnalysis && (
        <Card title="🤖 AI Analysis">
          {incident.aiAnalysis.summary && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Summary</h4>
              <p className="text-gray-600 text-sm">{incident.aiAnalysis.summary}</p>
            </div>
          )}
          {incident.aiAnalysis.rootCause && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Root Cause</h4>
              <p className="text-gray-600 text-sm">{incident.aiAnalysis.rootCause}</p>
            </div>
          )}
          {incident.aiAnalysis.recommendations && incident.aiAnalysis.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recommendations</h4>
              <ul className="space-y-1">
                {incident.aiAnalysis.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start space-x-2 text-sm text-gray-600">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Post-Mortem */}
      {postMortem && (
        <Card title="📄 Post-Mortem Report">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg">
            {postMortem}
          </pre>
        </Card>
      )}

      {/* Timeline */}
      <Card title="Timeline">
        {!incident.timeline || incident.timeline.length === 0 ? (
          <p className="text-gray-400 text-sm">No timeline events yet.</p>
        ) : (
          <ol className="relative border-l border-gray-200 space-y-6 ml-3">
            {incident.timeline
              .slice()
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((event) => (
                <li key={event.id} className="ml-4">
                  <div className="absolute w-3 h-3 bg-indigo-500 rounded-full -left-1.5 border-2 border-white" />
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                      {event.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{event.message}</p>
                  {event.author && (
                    <p className="text-xs text-gray-400 mt-1">
                      by {event.author.firstName} {event.author.lastName}
                    </p>
                  )}
                </li>
              ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
