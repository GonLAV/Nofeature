type SeverityLevel = 'P1' | 'P2' | 'P3' | 'P4'
type StatusType = 'open' | 'investigating' | 'mitigating' | 'resolved' | 'closed'

const severityClasses: Record<SeverityLevel, string> = {
  P1: 'bg-red-100 text-red-800',
  P2: 'bg-orange-100 text-orange-800',
  P3: 'bg-yellow-100 text-yellow-800',
  P4: 'bg-blue-100 text-blue-800',
}

const statusClasses: Record<StatusType, string> = {
  open: 'bg-red-100 text-red-800',
  investigating: 'bg-yellow-100 text-yellow-800',
  mitigating: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
}

interface BadgeProps {
  type: 'severity' | 'status'
  value: string
}

export default function Badge({ type, value }: BadgeProps) {
  const classes =
    type === 'severity'
      ? (severityClasses[value as SeverityLevel] ?? 'bg-gray-100 text-gray-800')
      : (statusClasses[value as StatusType] ?? 'bg-gray-100 text-gray-800')

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {value}
    </span>
  )
}
