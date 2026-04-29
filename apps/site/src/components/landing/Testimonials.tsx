'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

const testimonials = [
  {
    name: 'Emily Zhang',
    role: 'VP Engineering',
    company: 'DataStream',
    initials: 'EZ',
    color: 'from-indigo-500 to-violet-600',
    quote: 'War Room AI cut our MTTR from 2 hours to under 15 minutes. The AI root cause analysis is scarily accurate.',
    stars: 5,
  },
  {
    name: 'Marcus Johnson',
    role: 'SRE Lead',
    company: 'CloudBase',
    initials: 'MJ',
    color: 'from-cyan-500 to-blue-600',
    quote: 'The auto-generated post-mortems save us 3-4 hours per incident. Our stakeholders love the clarity and detail.',
    stars: 5,
  },
  {
    name: 'Priya Patel',
    role: 'CTO',
    company: 'Nexus Labs',
    initials: 'PP',
    color: 'from-violet-500 to-pink-600',
    quote: 'We went from incident chaos to structured response in one week. The team coordination features are a game-changer.',
    stars: 5,
  },
]

export function Testimonials() {
  return (
    <section className="relative py-32">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Testimonials</span>
          <h2 className="text-4xl md:text-5xl font-bold mt-3">
            Loved by <span className="text-gradient">engineering teams</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="glass rounded-2xl p-6 flex flex-col gap-4"
            >
              <div className="flex items-center gap-1">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-foreground/80 text-sm leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-xs font-semibold`}>
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role} at {t.company}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
