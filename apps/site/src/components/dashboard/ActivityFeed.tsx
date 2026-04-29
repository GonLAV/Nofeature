'use client'

import { motion } from 'framer-motion'
import { Zap, ArrowUp, UserCheck, Plus } from 'lucide-react'
import { mockActivity } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const typeConfig = {
  escalate: { icon: ArrowUp, color: 'bg-red-500/20 text-red-400' },
  ai: { icon: Zap, color: 'bg-indigo-500/20 text-indigo-400' },
  assign: { icon: UserCheck, color: 'bg-cyan-500/20 text-cyan-400' },
  create: { icon: Plus, color: 'bg-emerald-500/20 text-emerald-400' },
}

export function ActivityFeed() {
  return (
    <div className="glass rounded-2xl p-6 h-full">
      <h2 className="font-semibold mb-4">Activity</h2>
      <div className="space-y-4">
        {mockActivity.map((activity, i) => {
          const config = typeConfig[activity.type as keyof typeof typeConfig]
          const Icon = config?.icon || Plus
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-3"
            >
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5', config?.color || 'bg-white/10')}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{activity.user}</span>
                  {' '}
                  <span className="text-muted-foreground">{activity.action}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{activity.time}</p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
