export const mockIncidents = [
  { id: '1', title: 'Database connection pool exhausted', severity: 'P1', status: 'open', commander: 'Sarah Chen', createdAt: '2 min ago' },
  { id: '2', title: 'API gateway latency spike >5s', severity: 'P2', status: 'investigating', commander: 'James Park', createdAt: '18 min ago' },
  { id: '3', title: 'Redis memory usage at 94%', severity: 'P2', status: 'mitigating', commander: 'Alex Torres', createdAt: '1h ago' },
  { id: '4', title: 'CDN cache invalidation failure', severity: 'P3', status: 'resolved', commander: 'Maria Silva', createdAt: '3h ago' },
  { id: '5', title: 'Auth service elevated 5xx errors', severity: 'P1', status: 'resolved', commander: 'Ryan Kim', createdAt: '6h ago' },
]

export const mockStats = {
  total: 47,
  open: 3,
  mttr: '23m',
  uptime: '99.97%'
}

export const mockActivity = [
  { user: 'Sarah Chen', action: 'escalated incident to P1', time: '2 min ago', type: 'escalate' },
  { user: 'AI Analysis', action: 'identified root cause: connection leak in v2.3.1', time: '5 min ago', type: 'ai' },
  { user: 'James Park', action: 'assigned as commander', time: '12 min ago', type: 'assign' },
  { user: 'System', action: 'auto-created incident from alert', time: '18 min ago', type: 'create' },
]
