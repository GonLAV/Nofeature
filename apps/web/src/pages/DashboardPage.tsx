import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

interface Incident {
  id: string
  title: string
  severity: string
  status: string
  commander?: { firstName: string; lastName: string }
  createdAt: string
}

interface IncidentListResponse {
  incidents: Incident[]
  total: number
  page: number
  totalPages: number
}

interface CreateIncidentForm {
  title: string
  severity: string
  description: string
}

const PAGE_SIZE = 10

export default function DashboardPage() {
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateIncidentForm>({ title: '', severity: 'P3', description: '' })
  const [formError, setFormError] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<IncidentListResponse>({
    queryKey: ['incidents', page],
    queryFn: async () => {
      const res = await api.get(`/api/v1/incidents?page=${page}&limit=${PAGE_SIZE}`)
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateIncidentForm) => api.post('/api/v1/incidents', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      setShowModal(false)
      setForm({ title: '', severity: 'P3', description: '' })
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      setFormError(message ?? 'Failed to create incident.')
    },
  })

  const incidents = data?.incidents ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const counts = {
    total,
    open: incidents.filter((i) => i.status === 'open').length,
    p1: incidents.filter((i) => i.severity === 'P1').length,
    p2: incidents.filter((i) => i.severity === 'P2').length,
  }

  const stats = [
    { label: 'Total Incidents', value: counts.total, color: 'text-gray-900' },
    { label: 'Open', value: counts.open, color: 'text-red-600' },
    { label: 'P1 Critical', value: counts.p1, color: 'text-red-700' },
    { label: 'P2 High', value: counts.p2, color: 'text-orange-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <Button onClick={() => setShowModal(true)}>+ Create Incident</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card title="Incidents">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No incidents found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    {['Title', 'Severity', 'Status', 'Commander', 'Created At'].map((h) => (
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
                  {incidents.map((incident) => (
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
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {incident.commander
                          ? `${incident.commander.firstName} ${incident.commander.lastName}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(incident.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Create Incident Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Create Incident</h3>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Brief description of the incident"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="P1">P1 – Critical</option>
                  <option value="P2">P2 – High</option>
                  <option value="P3">P3 – Medium</option>
                  <option value="P4">P4 – Low</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Describe what is happening..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowModal(false)
                  setFormError('')
                }}
              >
                Cancel
              </Button>
              <Button
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
