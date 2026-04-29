import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, Zap, Crown, Building2, CreditCard, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface PlanDetails {
  key: string;
  name: string;
  priceMonthly: number;
  incidents: number;
  users: number;
  features: string[];
}

interface PlanStatus {
  plan: string;
  planDetails: PlanDetails;
  isSubscribed: boolean;
  subscriptionStatus: string | null;
  trial: { active: boolean; daysLeft: number; endsAt: string | null };
  prices: { growth: string; enterprise: string };
  stripeConfigured: boolean;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter:    <Zap size={20} className="text-gray-500" />,
  growth:     <Crown size={20} className="text-blue-600" />,
  enterprise: <Building2 size={20} className="text-purple-600" />,
};

const PLAN_COLORS: Record<string, string> = {
  starter:    'border-gray-200',
  growth:     'border-blue-500 ring-2 ring-blue-100',
  enterprise: 'border-purple-500 ring-2 ring-purple-100',
};

const PLAN_BADGE: Record<string, string> = {
  growth:     'bg-blue-600 text-white',
  enterprise: 'bg-purple-600 text-white',
};

export default function Billing() {
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['billing-plan'],
    queryFn: () => api.get<{ data: PlanStatus }>('/billing/plan').then(r => r.data.data),
  });

  const checkoutMutation = useMutation({
    mutationFn: (priceId: string) =>
      api.post<{ data: { url: string } }>('/billing/checkout', { priceId }).then(r => r.data.data.url),
    onSuccess: (url) => { window.location.href = url; },
    onError: () => toast.error('Failed to start checkout — check Stripe configuration'),
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      api.post<{ data: { url: string } }>('/billing/portal').then(r => r.data.data.url),
    onSuccess: (url) => { window.location.href = url; },
    onError: () => toast.error('Failed to open billing portal'),
  });

  if (isLoading) {
    return <div className="p-8 text-gray-400">Loading billing info…</div>;
  }

  const status = statusData!;
  const currentPlan = status.plan;

  const plans = [
    {
      key: 'starter',
      name: 'Starter',
      price: '$0',
      period: 'free forever',
      tagline: 'For small teams getting started',
      incidents: '5 active incidents',
      users: '3 team members',
      features: [
        'Up to 5 active incidents',
        '3 team members',
        '7-day data retention',
        'Basic AI analysis',
        'Email notifications',
      ],
      priceId: null,
      cta: 'Current plan',
      highlight: false,
    },
    {
      key: 'growth',
      name: 'Growth',
      price: '$299',
      period: '/month',
      tagline: 'For growing engineering teams',
      incidents: 'Unlimited incidents',
      users: '25 team members',
      features: [
        'Unlimited active incidents',
        '25 team members',
        '90-day data retention',
        'Streaming AI analysis',
        'Real-time War Room chat',
        'Slack integration',
        'Post-mortem generation',
        'Priority support',
      ],
      priceId: status.prices.growth,
      cta: 'Upgrade to Growth',
      highlight: true,
    },
    {
      key: 'enterprise',
      name: 'Enterprise',
      price: '$999',
      period: '/month',
      tagline: 'For large orgs with compliance needs',
      incidents: 'Unlimited incidents',
      users: 'Unlimited members',
      features: [
        'Everything in Growth',
        'Unlimited team members',
        '365-day data retention',
        'Custom AI model selection',
        'SSO / SAML',
        'Audit log export',
        'SLA guarantee',
        'Dedicated Slack support',
      ],
      priceId: status.prices.enterprise,
      cta: 'Upgrade to Enterprise',
      highlight: false,
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Billing &amp; Plans</h1>
        <p className="text-gray-500 mt-1">Manage your subscription and upgrade your plan</p>
      </div>

      {/* Trial / current status banner */}
      {status.trial.active && !status.isSubscribed && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Clock size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-800">
              Free trial — {status.trial.daysLeft} day{status.trial.daysLeft !== 1 ? 's' : ''} remaining
            </p>
            <p className="text-sm text-blue-600 mt-0.5">
              You have access to all Growth features during your trial.
              Subscribe before your trial ends to keep them.
            </p>
          </div>
        </div>
      )}

      {!status.trial.active && !status.isSubscribed && currentPlan === 'starter' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Your free trial has ended</p>
            <p className="text-sm text-amber-600 mt-0.5">
              You're on the Starter plan. Upgrade to unlock unlimited incidents, AI streaming, and the live War Room.
            </p>
          </div>
        </div>
      )}

      {status.isSubscribed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle size={18} className="text-green-600" />
            <div>
              <p className="font-medium text-green-800">
                Active subscription — {status.planDetails.name} plan
              </p>
              <p className="text-sm text-green-600">Status: {status.subscriptionStatus}</p>
            </div>
          </div>
          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="flex items-center gap-2 text-sm bg-white border border-green-300 text-green-700 px-4 py-2 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            <CreditCard size={14} />
            {portalMutation.isPending ? 'Opening…' : 'Manage subscription'}
          </button>
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.key === currentPlan;
          const isUpgrade =
            (currentPlan === 'starter' && (plan.key === 'growth' || plan.key === 'enterprise')) ||
            (currentPlan === 'growth' && plan.key === 'enterprise');

          return (
            <div
              key={plan.key}
              className={`bg-white rounded-2xl border p-6 flex flex-col relative ${PLAN_COLORS[plan.key] ?? 'border-gray-200'}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${PLAN_BADGE[plan.key]}`}>
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-2 mb-3">
                {PLAN_ICONS[plan.key]}
                <span className="font-semibold">{plan.name}</span>
                {isCurrent && (
                  <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    Current
                  </span>
                )}
              </div>

              <div className="mb-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-gray-500 text-sm ml-1">{plan.period}</span>
              </div>
              <p className="text-sm text-gray-500 mb-5">{plan.tagline}</p>

              {/* Features */}
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-400 cursor-default"
                >
                  Current plan
                </button>
              ) : isUpgrade && plan.priceId ? (
                <button
                  onClick={() => {
                    if (!status.stripeConfigured) {
                      toast.error('Stripe is not configured — add STRIPE_* env vars');
                      return;
                    }
                    checkoutMutation.mutate(plan.priceId!);
                  }}
                  disabled={checkoutMutation.isPending}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    plan.key === 'growth'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {checkoutMutation.isPending ? 'Redirecting…' : plan.cta}
                </button>
              ) : plan.key === 'starter' ? (
                <button
                  onClick={() => portalMutation.mutate()}
                  disabled={!status.isSubscribed || portalMutation.isPending}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  {status.isSubscribed ? 'Downgrade via portal' : 'Free plan'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Limits table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Plan comparison</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Feature</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Starter</th>
              <th className="text-center px-4 py-3 text-blue-700 font-medium">Growth</th>
              <th className="text-center px-4 py-3 text-purple-700 font-medium">Enterprise</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              ['Active incidents', '5', 'Unlimited', 'Unlimited'],
              ['Team members', '3', '25', 'Unlimited'],
              ['Data retention', '7 days', '90 days', '365 days'],
              ['Streaming AI', '—', '✓', '✓'],
              ['War Room chat', '—', '✓', '✓'],
              ['Slack integration', '—', '✓', '✓'],
              ['Post-mortem AI', '—', '✓', '✓'],
              ['SSO / SAML', '—', '—', '✓'],
              ['Audit log export', '—', '—', '✓'],
              ['SLA guarantee', '—', '—', '✓'],
            ].map(([feature, ...values]) => (
              <tr key={feature} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-700">{feature}</td>
                {values.map((v, i) => (
                  <td key={i} className={`text-center px-4 py-3 ${v === '—' ? 'text-gray-300' : 'text-gray-800'}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!status.stripeConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          <strong>Stripe not configured.</strong> Add{' '}
          <code className="bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code>,{' '}
          <code className="bg-amber-100 px-1 rounded">STRIPE_PRICE_GROWTH</code>, and{' '}
          <code className="bg-amber-100 px-1 rounded">STRIPE_WEBHOOK_SECRET</code>{' '}
          to your environment to enable payments.
        </div>
      )}
    </div>
  );
}
