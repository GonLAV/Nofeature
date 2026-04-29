'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string
  trend?: { value: string; up: boolean }
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
}

export function StatsCard({ title, value, trend, icon: Icon, iconColor = 'text-indigo-400' }: StatsCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -2 }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      </div>
      <p className="text-3xl font-bold mb-2">{value}</p>
      {trend && (
        <div className={cn('flex items-center gap-1 text-xs font-medium', trend.up ? 'text-emerald-400' : 'text-red-400')}>
          {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend.value} vs last week
        </div>
      )}
    </motion.div>
  )
}
