import { AlertTriangle, CheckCircle2, Clock, Activity } from 'lucide-react'
import { TopBar } from '@/components/dashboard/TopBar'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { IncidentTable } from '@/components/dashboard/IncidentTable'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { mockStats } from '@/lib/mock-data'

export default function DashboardPage() {
  return (
    <div>
      <TopBar title="Dashboard" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Incidents"
            value={String(mockStats.total)}
            trend={{ value: '+12%', up: false }}
            icon={AlertTriangle}
            iconColor="text-amber-400"
          />
          <StatsCard
            title="Open Incidents"
            value={String(mockStats.open)}
            trend={{ value: '-25%', up: true }}
            icon={Activity}
            iconColor="text-red-400"
          />
          <StatsCard
            title="MTTR"
            value={mockStats.mttr}
            trend={{ value: '-18%', up: true }}
            icon={Clock}
            iconColor="text-cyan-400"
          />
          <StatsCard
            title="Uptime"
            value={mockStats.uptime}
            trend={{ value: '+0.02%', up: true }}
            icon={CheckCircle2}
            iconColor="text-emerald-400"
          />
        </div>

        {/* Severity chart */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-6">Incidents by Severity (Last 30 days)</h2>
          <div className="flex items-end gap-4 h-32">
            {[
              { label: 'P1', count: 5, color: 'bg-red-500' },
              { label: 'P2', count: 12, color: 'bg-amber-500' },
              { label: 'P3', count: 20, color: 'bg-blue-500' },
              { label: 'P4', count: 10, color: 'bg-emerald-500' },
            ].map((bar) => (
              <div key={bar.label} className="flex flex-col items-center gap-2 flex-1">
                <span className="text-xs text-muted-foreground">{bar.count}</span>
                <div
                  className={`w-full rounded-t-md ${bar.color} opacity-80 transition-all`}
                  style={{ height: `${(bar.count / 20) * 100}%` }}
                />
                <span className="text-xs text-muted-foreground">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <IncidentTable />
          </div>
          <div>
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  )
}
