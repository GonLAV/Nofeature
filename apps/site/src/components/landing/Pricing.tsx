'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const plans = [
  {
    name: 'Starter',
    price: { monthly: 0, annual: 0 },
    description: 'Perfect for small teams getting started with incident management.',
    features: ['Up to 5 team members', '10 incidents/month', 'Basic AI analysis', 'Email notifications', '7-day history'],
    cta: 'Get started free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: { monthly: 49, annual: 39 },
    description: 'For growing engineering teams that need powerful incident management.',
    features: ['Unlimited team members', 'Unlimited incidents', 'Advanced AI analysis', 'Auto post-mortems', 'Slack & PagerDuty', 'Custom runbooks', '1-year history', 'Priority support'],
    cta: 'Start Pro trial',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: { monthly: null, annual: null },
    description: 'Custom solutions for large organizations with complex needs.',
    features: ['Everything in Pro', 'Custom AI models', 'SSO & SAML', 'Dedicated SLA', 'Custom integrations', 'White-label option', 'Compliance reports', 'Dedicated CSM'],
    cta: 'Contact sales',
    highlight: false,
  },
]

export function Pricing() {
  const [annual, setAnnual] = useState(false)

  return (
    <section id="pricing" className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Pricing</span>
          <h2 className="text-4xl md:text-5xl font-bold mt-3 mb-4">
            Simple, <span className="text-gradient">transparent pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            No hidden fees. Cancel anytime. Start free.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 p-1 rounded-full border border-white/10 bg-white/5">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                !annual ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                annual ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Annual
              <span className="ml-2 text-xs text-emerald-400 font-semibold">-20%</span>
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={cn(
                'relative rounded-2xl p-6 flex flex-col',
                plan.highlight
                  ? 'bg-gradient-to-b from-indigo-500/10 to-violet-600/10 border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                  : 'glass'
              )}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                  {plan.badge}
                </div>
              )}
              <div className="mb-6">
                <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>
              <div className="mb-6">
                {plan.price.monthly === null ? (
                  <div className="text-3xl font-bold">Custom</div>
                ) : plan.price.monthly === 0 ? (
                  <div className="text-3xl font-bold">Free</div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">
                      ${annual ? plan.price.annual : plan.price.monthly}
                    </span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                )}
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-foreground/80">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href="/auth/register">
                <Button
                  variant={plan.highlight ? 'default' : 'outline'}
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
