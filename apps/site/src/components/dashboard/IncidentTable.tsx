'use client'

import { motion } from 'framer-motion'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { mockIncidents } from '@/lib/mock-data'

function getSeverityVariant(severity: string): BadgeProps['variant'] {
  switch (severity) {
    case 'P1': return 'destructive'
    case 'P2': return 'warning'
    case 'P3': return 'info'
    default: return 'secondary'
  }
}

function getStatusVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'open': return 'destructive'
    case 'investigating': return 'warning'
    case 'mitigating': return 'info'
    case 'resolved': return 'success'
    default: return 'secondary'
  }
}

export function IncidentTable() {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5">
        <h2 className="font-semibold">Recent Incidents</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Incident</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Commander</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {mockIncidents.map((incident, i) => (
              <motion.tr
                key={incident.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-foreground/90">{incident.title}</span>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={getSeverityVariant(incident.severity)}>{incident.severity}</Badge>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={getStatusVariant(incident.status)} className="capitalize">{incident.status}</Badge>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-muted-foreground">{incident.commander}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-muted-foreground">{incident.createdAt}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
