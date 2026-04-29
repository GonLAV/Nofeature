'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CTA() {
  const [email, setEmail] = useState('')

  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,rgba(99,102,241,0.12),transparent)]" />
      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="glass rounded-3xl p-12 glow-indigo"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Ready to end <span className="text-gradient">incident chaos?</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Join 500+ engineering teams using War Room AI to resolve incidents faster. 
            Start free — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Enter your work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 h-12 text-base"
            />
            <Button size="lg" className="h-12 px-6 shrink-0">
              Get started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Free forever plan available. No credit card required.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
