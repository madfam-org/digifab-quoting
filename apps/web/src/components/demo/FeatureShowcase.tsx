'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  BarChart3,
  Layers,
  Clock,
  Brain,
  Globe,
  Smartphone,
  Code,
  Users,
  Shield,
} from 'lucide-react';

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  benefits: string[];
  demo: {
    title: string;
    description: string;
    metrics?: { label: string; value: string; improvement?: string }[];
  };
  color: string;
}

const FEATURES: Feature[] = [
  {
    id: 'instant-quotes',
    title: 'Lightning-Fast Quotes',
    description: 'Get manufacturing quotes in seconds, not days',
    icon: <Zap className="w-8 h-8" />,
    color: 'from-yellow-400 to-orange-500',
    benefits: [
      'Results in under 3 seconds',
      'Process 100+ files simultaneously',
      'Real-time cost updates',
      'No waiting for email responses',
    ],
    demo: {
      title: 'Speed Comparison',
      description: 'Traditional vs Cotiza Studio quoting timeline',
      metrics: [
        { label: 'Traditional', value: '3-7 days', improvement: '' },
        { label: 'Cotiza Studio', value: '< 3 seconds', improvement: '99.9% faster' },
        { label: 'Accuracy', value: '±5%', improvement: 'Industry leading' },
      ],
    },
  },
  {
    id: 'smart-optimization',
    title: 'AI-Powered Optimization',
    description: 'Reduce costs while maintaining quality with smart suggestions',
    icon: <Brain className="w-8 h-8" />,
    color: 'from-purple-500 to-pink-500',
    benefits: [
      'Automatic cost reduction suggestions',
      'DFM (Design for Manufacturing) analysis',
      'Material selection optimization',
      'Process recommendations',
    ],
    demo: {
      title: 'Cost Savings',
      description: 'Average savings per project across different categories',
      metrics: [
        { label: 'Material costs', value: '23%', improvement: 'reduction' },
        { label: 'Process time', value: '35%', improvement: 'faster' },
        { label: 'Overall project', value: '$234', improvement: 'average savings' },
      ],
    },
  },
  {
    id: 'multi-process',
    title: 'Multiple Manufacturing Processes',
    description: 'Compare 3D printing, CNC machining, laser cutting, and more',
    icon: <Layers className="w-8 h-8" />,
    color: 'from-blue-500 to-cyan-500',
    benefits: [
      'All major processes supported',
      'Material libraries for each process',
      'Quality comparisons',
      'Lead time analysis',
    ],
    demo: {
      title: 'Process Comparison',
      description: 'Same part, different processes - see the trade-offs',
      metrics: [
        { label: '3D Printing', value: '$25', improvement: '2 days' },
        { label: 'CNC Machining', value: '$89', improvement: '5 days' },
        { label: 'Injection Molding', value: '$12', improvement: '14 days' },
      ],
    },
  },
  {
    id: 'business-tools',
    title: 'Business-Ready Features',
    description: 'Professional tools for shops, makerspaces, and enterprises',
    icon: <BarChart3 className="w-8 h-8" />,
    color: 'from-green-500 to-emerald-500',
    benefits: [
      'Customer management system',
      'Team collaboration tools',
      'White-label solutions',
      'API integrations',
    ],
    demo: {
      title: 'Business Impact',
      description: 'How Cotiza Studio transforms business operations',
      metrics: [
        { label: 'Quote time', value: '60%', improvement: 'reduction' },
        { label: 'Customer satisfaction', value: '40%', improvement: 'increase' },
        { label: 'Revenue per job', value: '25%', improvement: 'increase' },
      ],
    },
  },
  {
    id: 'market-intelligence',
    title: 'Market Intelligence',
    description: 'Access real-time pricing data and industry trends',
    icon: <Globe className="w-8 h-8" />,
    color: 'from-indigo-500 to-purple-500',
    benefits: [
      'Real supplier pricing data',
      'Market trend analysis',
      'Competitive intelligence',
      'Historical price tracking',
    ],
    demo: {
      title: 'Market Data',
      description: 'Live pricing intelligence from 1000+ suppliers',
      metrics: [
        { label: 'Price accuracy', value: '95%', improvement: 'confidence' },
        { label: 'Market coverage', value: '1000+', improvement: 'suppliers' },
        { label: 'Data freshness', value: '< 24h', improvement: 'updated' },
      ],
    },
  },
  {
    id: 'integrations',
    title: 'Seamless Integrations',
    description: 'Connect with your existing tools and workflows',
    icon: <Code className="w-8 h-8" />,
    color: 'from-red-500 to-pink-500',
    benefits: [
      'REST API with webhooks',
      'CAD software plugins (coming)',
      'E-commerce integrations',
      'CRM and ERP connections',
    ],
    demo: {
      title: 'Integration Options',
      description: 'Connect Cotiza Studio to your existing workflow',
      metrics: [
        { label: 'API uptime', value: '99.9%', improvement: 'reliability' },
        { label: 'Response time', value: '< 200ms', improvement: 'average' },
        { label: 'Integrations', value: '50+', improvement: 'available' },
      ],
    },
  },
];

export function FeatureShowcase() {
  const [activeFeature, setActiveFeature] = useState(FEATURES[0]);

  return (
    <div className="space-y-16">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Powerful Features for Every Need</h2>
        <p className="text-xl text-blue-100 max-w-3xl mx-auto">
          From instant quotes to market intelligence, Cotiza Studio provides everything you need to
          make informed manufacturing decisions
        </p>
      </div>

      {/* Feature Navigation */}
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
        {FEATURES.map((feature) => (
          <motion.button
            key={feature.id}
            onClick={() => setActiveFeature(feature)}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              activeFeature.id === feature.id
                ? 'border-white bg-white/10 shadow-lg'
                : 'border-white/20 hover:border-white/40 hover:bg-white/5'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div
              className={`inline-flex p-2 rounded-lg bg-gradient-to-r ${feature.color} text-white mb-3`}
            >
              {feature.icon}
            </div>
            <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
            <p className="text-blue-100 text-xs">{feature.description}</p>
          </motion.button>
        ))}
      </div>

      {/* Feature Details */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFeature.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Feature Info */}
            <div>
              <div className="flex items-center mb-6">
                <div
                  className={`p-4 rounded-xl bg-gradient-to-r ${activeFeature.color} text-white mr-4`}
                >
                  {activeFeature.icon}
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-white mb-2">{activeFeature.title}</h3>
                  <p className="text-blue-100">{activeFeature.description}</p>
                </div>
              </div>

              {/* Benefits */}
              <div className="space-y-4">
                <h4 className="text-xl font-semibold text-white mb-4">Key Benefits</h4>
                {activeFeature.benefits.map((benefit, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center space-x-3"
                  >
                    <div
                      className={`w-2 h-2 rounded-full bg-gradient-to-r ${activeFeature.color}`}
                    />
                    <span className="text-blue-100">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Demo/Metrics */}
            <div className="bg-white rounded-2xl p-8">
              <h4 className="text-2xl font-bold mb-2">{activeFeature.demo.title}</h4>
              <p className="text-gray-600 mb-6">{activeFeature.demo.description}</p>

              {activeFeature.demo.metrics && (
                <div className="space-y-4">
                  {activeFeature.demo.metrics.map((metric, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="font-semibold text-gray-800">{metric.label}</div>
                        {metric.improvement && (
                          <div className="text-sm text-gray-600">{metric.improvement}</div>
                        )}
                      </div>
                      <div
                        className={`text-2xl font-bold bg-gradient-to-r ${activeFeature.color} bg-clip-text text-transparent`}
                      >
                        {metric.value}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* CTA */}
              <div className="mt-8">
                <button
                  className={`w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r ${activeFeature.color} hover:scale-105 transition-transform`}
                >
                  Try This Feature
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Trust Indicators */}
      <div className="grid md:grid-cols-4 gap-8 text-center">
        {[
          { icon: <Users />, label: '10,000+', description: 'Happy Users' },
          { icon: <Clock />, label: '99.9%', description: 'Uptime' },
          { icon: <Shield />, label: 'SOC 2', description: 'Compliant' },
          { icon: <Smartphone />, label: '24/7', description: 'Support' },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="text-white"
          >
            <div className="inline-flex p-3 rounded-full bg-white/10 mb-4">{stat.icon}</div>
            <div className="text-3xl font-bold mb-2">{stat.label}</div>
            <div className="text-blue-100">{stat.description}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
