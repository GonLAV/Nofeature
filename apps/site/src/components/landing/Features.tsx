'use client'

import { motion } from 'framer-motion'
import { Brain, FileText, Bell, Clock, Users, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: Brain,
    title: 'AI Root Cause Analysis',
    description: 'Our AI analyzes logs, metrics, and traces in real-time to pinpoint root causes within seconds, not hours.',
    gradient: 'from-indigo-500 to-violet-600',
  },
  {
    icon: FileText,
    title: 'Auto Post-Mortems',
    description: 'Automatically generate comprehensive post-mortem reports with action items, timeline, and contributing factors.',
    gradient: 'from-violet-500 to-pink-600',
  },
  {
    icon: Bell,
    title: 'Smart Alerting',
    description: 'Intelligent alert correlation reduces noise by 90%. Only get paged when it truly matters.',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    icon: Clock,
    title: 'Timeline Tracking',
    description: 'Automatic incident timeline with every action, decision, and system event captured for perfect context.',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: Users,
    title: 'Team Coordination',
    description: 'Built-in war room with role assignments, runbooks, and real-time communication for rapid response.',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    icon: BarChart3,
    title: 'Analytics & MTTR',
    description: 'Track MTTR, incident frequency, and reliability trends with actionable insights to prevent recurrence.',
    gradient: 'from-pink-500 to-rose-600',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export function Features() {
  return (
    <section id="features" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(99,102,241,0.05),transparent)]" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Features</span>
          <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-4">
            Everything you need to{' '}
            <span className="text-gradient">resolve faster</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            War Room AI brings together every tool your team needs during an incident into one intelligent platform.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -4 }}
                className="glass rounded-2xl p-6 group cursor-default"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
