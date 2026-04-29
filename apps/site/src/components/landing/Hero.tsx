'use client'

import { motion } from 'framer-motion'
import { Play, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const words = ['Resolve', 'incidents', '10x', 'faster', 'with', 'AI']

const companyLogos = ['Stripe', 'Vercel', 'Linear', 'Notion', 'Figma']

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Mesh gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.15),transparent)]" />

      {/* Floating orbs */}
      <motion.div
        animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, 20, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20">
        <div className="flex flex-col items-center text-center gap-8">
          {/* Announcement badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-sm text-indigo-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
            New: AI Post-Mortem Generation
            <ArrowRight className="w-3 h-3" />
          </motion.div>

          {/* Headline */}
          <div className="overflow-hidden">
            <motion.h1
              className="text-5xl md:text-7xl font-bold tracking-tight leading-tight"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.07 } },
                hidden: {},
              }}
            >
              {words.slice(0, 3).map((word, i) => (
                <motion.span
                  key={i}
                  variants={{
                    hidden: { opacity: 0, y: 30 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                  }}
                  className="text-gradient mr-3"
                >
                  {word}{' '}
                </motion.span>
              ))}
              <br />
              {words.slice(3).map((word, i) => (
                <motion.span
                  key={i}
                  variants={{
                    hidden: { opacity: 0, y: 30 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                  }}
                  className={i === 2 ? 'text-gradient' : 'text-foreground mr-3'}
                >
                  {word}{' '}
                </motion.span>
              ))}
            </motion.h1>
          </div>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
          >
            War Room AI transforms incident response with intelligent root cause analysis, 
            automated post-mortems, and real-time team coordination — cutting your MTTR by 10x.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link href="/auth/register">
              <Button size="lg" className="text-base px-8">
                Start free trial
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-base px-8 group">
              <Play className="mr-2 w-4 h-4 fill-current group-hover:text-indigo-400 transition-colors" />
              Watch demo
            </Button>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="flex flex-col items-center gap-4"
          >
            <p className="text-sm text-muted-foreground">
              Trusted by 500+ engineering teams at
            </p>
            <div className="flex items-center gap-8">
              {companyLogos.map((logo) => (
                <span
                  key={logo}
                  className="text-sm font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  {logo}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Hero graphic */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="w-full max-w-4xl mt-8"
          >
            <div className="glass rounded-2xl p-6 glow-indigo">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <div className="ml-4 flex-1 h-6 rounded bg-white/5 flex items-center px-3">
                  <span className="text-xs text-muted-foreground">warroom.ai/dashboard</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Active Incidents', value: '3', color: 'text-red-400' },
                  { label: 'MTTR', value: '23m', color: 'text-amber-400' },
                  { label: 'Uptime', value: '99.97%', color: 'text-emerald-400' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { title: 'DB connection pool exhausted', severity: 'P1', status: 'open', pulse: true },
                  { title: 'API gateway latency spike', severity: 'P2', status: 'investigating', pulse: false },
                  { title: 'Redis memory at 94%', severity: 'P2', status: 'mitigating', pulse: false },
                ].map((incident, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-4 py-3">
                    <div className="flex items-center gap-3">
                      {incident.pulse && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                      )}
                      <span className="text-sm text-foreground/80">{incident.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        incident.severity === 'P1' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>{incident.severity}</span>
                      <span className="text-xs text-muted-foreground capitalize">{incident.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
