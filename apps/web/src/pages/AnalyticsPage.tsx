import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'

interface Incident {
  id: string
  title: string
  severity: string
  status: string
  createdAt: string
  resolvedAt?: string
}

function computeMttr(incidents: Incident[]): number | null {
  const resolved = incidents.filter((i) => i.resolvedAt)
  if (resolved.length === 0) return null
  const total = resolved.reduce((sum, i) => {
    const diff = new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()
    return sum + diff
  }, 0)
  return Math.round(total / resolved.length / 60000)
}

export default function AnalyticsPage() {
  const { data: listData, isLoading } = useQuery<{ incidents: Incident[]; total: number }>({
    queryKey: ['analytics-incidents'],
    queryFn: async () => {
      const res = await api.get('/api/v1/incidents?limit=100')
      return res.data
    },
  })

  const incidents = listData?.incidents ?? []
  const total = listData?.total ?? 0

  const bySeverity = incidents.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1
    return acc
  }, {})

  const byStatus = incidents.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})

  const mttr = computeMttr(incidents)
  const recentIncidents = incidents.slice(0, 10)

  const severityOrder = ['P1', 'P2', 'P3', 'P4']
  const statusOrder = ['open', 'investigating', 'mitigating', 'resolved', 'closed']

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-gray-900">{total}</div>
          <div className="text-sm text-gray-500 mt-1">Total Incidents</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-red-600">{bySeverity['P1'] ?? 0}</div>
          <div className="text-sm text-gray-500 mt-1">P1 Critical</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-indigo-600">
            {mttr !== null ? `${mttr}m` : '—'}
          </div>
          <div className="text-sm text-gray-500 mt-1">Avg MTTR</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Severity */}
        <Card title="Incidents by Severity">
          <div className="space-y-3">
            {severityOrder.map((s) => {
              const count = bySeverity[s] ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <Badge type="severity" value={s} />
                    <span className="text-sm font-medium text-gray-700">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* By Status */}
        <Card title="Incidents by Status">
          <div className="space-y-3">
            {statusOrder.map((s) => {
              const count = byStatus[s] ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <Badge type="status" value={s} />
                    <span className="text-sm font-medium text-gray-700">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Recent Incidents Table */}
      <Card title="Recent Incidents">
        {recentIncidents.length === 0 ? (
          <div className="text-center py-6 text-gray-400">No incidents available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  {['Title', 'Severity', 'Status', 'Created', 'MTTR'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentIncidents.map((incident) => {
                  const mttrMin = incident.resolvedAt
                    ? Math.round(
                        (new Date(incident.resolvedAt).getTime() - new Date(incident.createdAt).getTime()) /
                          60000
                      )
                    : null
                  return (
                    <tr key={incident.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/incidents/${incident.id}`}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          {incident.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge type="severity" value={incident.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge type="status" value={incident.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(incident.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {mttrMin !== null ? `${mttrMin}m` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
