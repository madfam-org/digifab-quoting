'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Zap, Crown, Rocket, ArrowRight } from 'lucide-react';

interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    yearly: number;
  };
  badge?: string;
  icon: React.ReactNode;
  features: string[];
  limits: {
    quotes: string;
    apiCalls?: string;
    users?: string;
    storage?: string;
  };
  cta: string;
  popular?: boolean;
  color: string;
  targetPersona: string;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Maker',
    description: 'Perfect for hobbyists and DIY projects',
    price: { monthly: 0, yearly: 0 },
    icon: <Zap className="w-8 h-8" />,
    color: 'border-gray-200 bg-white',
    targetPersona: 'DIY Makers & Students',
    limits: {
      quotes: '3 quotes/month',
      storage: '100MB storage',
    },
    features: [
      'Basic material library',
      '3D printing & laser cutting',
      'Community support',
      'DIY vs buy analysis',
      'Basic tutorials',
    ],
    cta: 'Start Free',
  },
  {
    id: 'pro',
    name: 'Creator Pro',
    description: 'For serious makers and small businesses',
    price: { monthly: 19, yearly: 190 },
    badge: 'Most Popular',
    popular: true,
    icon: <Star className="w-8 h-8" />,
    color: 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50',
    targetPersona: 'Active Makers & Freelancers',
    limits: {
      quotes: '50 quotes/month',
      storage: '1GB storage',
      apiCalls: '100 API calls/month',
    },
    features: [
      'All materials & processes',
      'Time vs cost calculator',
      'Design optimization tips',
      'Priority support',
      'Bulk quote discounts',
      'Export detailed reports',
      'Basic API access',
    ],
    cta: 'Start Free Trial',
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For shops, makerspaces, and growing businesses',
    price: { monthly: 99, yearly: 990 },
    icon: <Rocket className="w-8 h-8" />,
    color: 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50',
    targetPersona: 'Shop Owners & Teams',
    limits: {
      quotes: 'Unlimited quotes',
      users: '5 team members',
      storage: '10GB storage',
      apiCalls: '1,000 API calls/month',
    },
    features: [
      'Everything in Creator Pro',
      'Customer management',
      'White-label basic',
      'Team collaboration',
      'Advanced analytics',
      'Custom branding',
      'Integration webhooks',
      'Phone support',
    ],
    cta: 'Start Business Trial',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large operations with custom needs',
    price: { monthly: 499, yearly: 4990 },
    badge: 'Best Value',
    icon: <Crown className="w-8 h-8" />,
    color: 'border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50',
    targetPersona: 'Large Teams & Enterprises',
    limits: {
      quotes: 'Unlimited everything',
      users: 'Unlimited users',
      storage: 'Unlimited storage',
      apiCalls: 'Unlimited API calls',
    },
    features: [
      'Everything in Business',
      'Complete white-label',
      'Custom integrations',
      'Market intelligence',
      'Dedicated account manager',
      'SLA guarantee',
      'Custom training',
      'Priority feature requests',
    ],
    cta: 'Contact Sales',
  },
];

export function PricingTiers() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const yearlyDiscount = (monthly: number, yearly: number) => {
    if (monthly === 0) return 0;
    return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Choose the perfect plan for your needs. Start free, upgrade anytime, cancel whenever.
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              billingPeriod === 'monthly'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={`px-6 py-2 rounded-lg font-semibold transition-all relative ${
              billingPeriod === 'yearly'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Yearly
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-8">
        {PRICING_TIERS.map((tier) => (
          <motion.div
            key={tier.id}
            className={`relative p-8 rounded-2xl border-2 transition-all ${
              tier.popular ? 'scale-105 shadow-xl' : 'hover:shadow-lg'
            } ${tier.color}`}
            whileHover={{ y: tier.popular ? 0 : -5 }}
          >
            {/* Badge */}
            {tier.badge && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                  {tier.badge}
                </div>
              </div>
            )}

            {/* Icon & Name */}
            <div className="text-center mb-6">
              <div
                className={`inline-flex p-3 rounded-xl mb-4 ${
                  tier.popular ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tier.icon}
              </div>
              <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
              <p className="text-gray-600 text-sm">{tier.description}</p>
              <p className="text-xs text-blue-600 font-medium mt-2">{tier.targetPersona}</p>
            </div>

            {/* Pricing */}
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center">
                <span className="text-4xl font-bold">${tier.price[billingPeriod]}</span>
                {tier.price[billingPeriod] > 0 && (
                  <span className="text-gray-600 ml-2">
                    /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                  </span>
                )}
              </div>

              {billingPeriod === 'yearly' && tier.price.monthly > 0 && (
                <div className="text-sm text-green-600 mt-1">
                  Save ${tier.price.monthly * 12 - tier.price.yearly}/year (
                  {yearlyDiscount(tier.price.monthly, tier.price.yearly)}% off)
                </div>
              )}

              {tier.price[billingPeriod] === 0 && (
                <div className="text-sm text-gray-500 mt-1">Free forever</div>
              )}
            </div>

            {/* Limits */}
            <div className="mb-6 p-4 bg-white/50 rounded-lg">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Quotes:</span>
                  <span className="font-semibold">{tier.limits.quotes}</span>
                </div>
                {tier.limits.apiCalls && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">API calls:</span>
                    <span className="font-semibold">{tier.limits.apiCalls}</span>
                  </div>
                )}
                {tier.limits.users && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Team size:</span>
                    <span className="font-semibold">{tier.limits.users}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Storage:</span>
                  <span className="font-semibold">{tier.limits.storage}</span>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="mb-8">
              <div className="space-y-3">
                {tier.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Button */}
            <button
              className={`w-full py-3 px-6 rounded-xl font-semibold transition-all flex items-center justify-center ${
                tier.popular
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : tier.id === 'enterprise'
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {tier.cta}
              {tier.id === 'enterprise' ? (
                <ArrowRight className="ml-2 w-4 h-4" />
              ) : (
                <Zap className="ml-2 w-4 h-4" />
              )}
            </button>

            {tier.id !== 'free' && (
              <p className="text-center text-xs text-gray-500 mt-3">
                {tier.id === 'enterprise'
                  ? 'Custom quote in 24h'
                  : '14-day free trial • No credit card required'}
              </p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Feature Comparison */}
      <div className="bg-gradient-to-br from-gray-50 to-white p-8 rounded-2xl border">
        <h3 className="text-2xl font-bold text-center mb-8">Compare All Features</h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-4 px-6">Features</th>
                {PRICING_TIERS.map((tier) => (
                  <th key={tier.id} className="text-center py-4 px-4 font-semibold">
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                'Basic materials',
                'All materials & processes',
                'API access',
                'Custom branding',
                'Team collaboration',
                'White-label solution',
                'Priority support',
                'Market intelligence',
              ].map((feature, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-4 px-6">{feature}</td>
                  <td className="text-center py-4 px-4">
                    {feature === 'Basic materials' ? '✓' : '—'}
                  </td>
                  <td className="text-center py-4 px-4">
                    {['Basic materials', 'All materials & processes', 'API access'].includes(
                      feature,
                    )
                      ? '✓'
                      : '—'}
                  </td>
                  <td className="text-center py-4 px-4">
                    {!['Market intelligence'].includes(feature) ? '✓' : '—'}
                  </td>
                  <td className="text-center py-4 px-4">✓</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="text-center">
        <h3 className="text-2xl font-bold mb-6">Frequently Asked Questions</h3>
        <div className="grid md:grid-cols-2 gap-6 text-left max-w-4xl mx-auto">
          <div>
            <h4 className="font-semibold mb-2">Can I change plans anytime?</h4>
            <p className="text-gray-600 text-sm">
              Yes, upgrade or downgrade anytime. Changes take effect immediately.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">What payment methods do you accept?</h4>
            <p className="text-gray-600 text-sm">
              All major credit cards, PayPal, and bank transfers for Enterprise.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Is there a free trial?</h4>
            <p className="text-gray-600 text-sm">
              Yes! 14-day free trial for all paid plans. No credit card required.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Do you offer refunds?</h4>
            <p className="text-gray-600 text-sm">
              30-day money-back guarantee if you're not completely satisfied.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
