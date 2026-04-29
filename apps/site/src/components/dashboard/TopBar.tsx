'use client'

import { Bell, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  title: string
  breadcrumbs?: string[]
}

export function TopBar({ title, breadcrumbs = [] }: TopBarProps) {
  return (
    <header className="h-16 border-b border-white/5 flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
        <h1 className="font-semibold text-foreground">{title}</h1>
        {breadcrumbs.map((crumb, i) => (
          <div key={i} className="flex items-center gap-2 text-muted-foreground">
            <ChevronRight className="w-4 h-4" />
            <span className="text-sm">{crumb}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        </Button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold cursor-pointer">
          DU
        </div>
      </div>
    </header>
  )
}
