import type { Metadata } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'War Room AI — Resolve Incidents 10x Faster',
  description: 'AI-powered incident management platform. Intelligent root cause analysis, automated post-mortems, and real-time team coordination.',
  keywords: ['incident management', 'SRE', 'DevOps', 'AI', 'post-mortem', 'MTTR'],
  openGraph: {
    title: 'War Room AI',
    description: 'Resolve incidents 10x faster with AI',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={cn('min-h-screen bg-background font-sans antialiased')}>
        {children}
      </body>
    </html>
  )
}
