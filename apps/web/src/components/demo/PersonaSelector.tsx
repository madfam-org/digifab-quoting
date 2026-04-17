'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Wrench, Building2, Lightbulb, GraduationCap, Briefcase } from 'lucide-react';

interface Persona {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  cta: string;
  color: string;
  benefits: string[];
  journey: {
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  };
}

const PERSONA_DESTINATIONS: Record<string, string> = {
  'diy-maker': '/try?persona=diy-maker',
  'shop-owner': '/auth/register?persona=shop-owner',
  'product-designer': '/quote/new?persona=product-designer',
  'procurement': '/quote/new?persona=procurement&mode=rfq',
  'educator': '/auth/register?persona=educator',
};

function getPersonaDestination(personaId: string): string {
  return PERSONA_DESTINATIONS[personaId] ?? `/quote/new?persona=${personaId}`;
}

const PERSONAS: Persona[] = [
  {
    id: 'diy-maker',
    title: 'DIY Maker & Hobbyist',
    description: 'Should I make this myself or pay someone else?',
    icon: <Wrench size={48} />,
    color: 'from-blue-500 to-cyan-500',
    features: [
      'DIY vs Professional cost comparison',
      'Time investment calculator',
      'Skill requirement assessment',
      'Tool & material sourcing',
      'Step-by-step tutorials'
    ],
    benefits: [
      'Save average of $234 per project',
      'Learn new skills confidently',
      'Make informed decisions',
      'Access to maker community'
    ],
    cta: 'Start DIY Analysis',
    journey: {
      step1: 'Upload your design or idea',
      step2: 'See DIY vs service comparison',
      step3: 'Get tool & material lists',
      step4: 'Choose your path & save money'
    }
  },
  {
    id: 'shop-owner',
    title: 'Shop & Makerspace Owner',
    description: 'I need professional quoting tools for my business',
    icon: <Building2 size={48} />,
    color: 'from-green-500 to-emerald-500',
    features: [
      'Automated professional quoting',
      'Customer management system',
      'Profit margin optimization',
      'Bulk quote processing',
      'White-label integration'
    ],
    benefits: [
      '60% faster quote generation',
      'Increase revenue per job',
      'Reduce administrative time',
      'Professional customer experience'
    ],
    cta: 'Start Free Business Trial',
    journey: {
      step1: 'Connect your existing workflow',
      step2: 'Process customer quotes instantly',
      step3: 'Optimize pricing & margins',
      step4: 'Scale your business operations'
    }
  },
  {
    id: 'product-designer',
    title: 'Product Designer & Engineer',
    description: 'I need design-for-manufacturing insights',
    icon: <Lightbulb size={48} />,
    color: 'from-purple-500 to-violet-500',
    features: [
      'Real-time DFM analysis',
      'Material selection guidance',
      'Design optimization suggestions',
      'Cost validation tools',
      'CAD integration (coming soon)'
    ],
    benefits: [
      'Reduce design iterations',
      'Optimize manufacturing costs',
      'Validate designs early',
      'Access industry best practices'
    ],
    cta: 'Try Design Analysis',
    journey: {
      step1: 'Upload your CAD files',
      step2: 'Get manufacturability insights',
      step3: 'See cost impact of changes',
      step4: 'Export optimized designs'
    }
  },
  {
    id: 'procurement',
    title: 'Procurement Specialist',
    description: 'I need competitive pricing & supplier intelligence',
    icon: <Briefcase size={48} />,
    color: 'from-orange-500 to-red-500',
    features: [
      'Multi-supplier comparison',
      'Market pricing intelligence',
      'Bulk quote processing',
      'Supplier performance analytics',
      'Cost trend analysis'
    ],
    benefits: [
      'Negotiate better prices',
      'Reduce procurement time',
      'Access market intelligence',
      'Track supplier performance'
    ],
    cta: 'Access Market Data',
    journey: {
      step1: 'Submit RFQ requirements',
      step2: 'Compare supplier options',
      step3: 'Analyze market trends',
      step4: 'Make data-driven decisions'
    }
  },
  {
    id: 'educator',
    title: 'Educator & Student',
    description: 'I need real manufacturing cost data for learning',
    icon: <GraduationCap size={48} />,
    color: 'from-indigo-500 to-blue-500',
    features: [
      'Educational pricing',
      'Real industry cost data',
      'Project-based learning tools',
      'Student collaboration features',
      'Curriculum integration'
    ],
    benefits: [
      'Teach with real data',
      'Engage students practically',
      'Bridge theory & practice',
      'Prepare industry-ready graduates'
    ],
    cta: 'Get Educational Access',
    journey: {
      step1: 'Sign up with .edu email',
      step2: 'Access educational content',
      step3: 'Create student projects',
      step4: 'Track learning progress'
    }
  }
];

export function PersonaSelector() {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const router = useRouter();

  const handlePersonaCta = (personaId: string) => {
    router.push(getPersonaDestination(personaId));
  };

  return (
    <div className="space-y-8">
      {/* Persona Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PERSONAS.map((persona) => (
          <motion.div
            key={persona.id}
            className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedPersona === persona.id
                ? 'border-blue-500 shadow-xl scale-105'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
            }`}
            onClick={() => setSelectedPersona(persona.id)}
            whileHover={{ y: -5 }}
            layout
          >
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${persona.color} opacity-5 rounded-2xl`} />
            
            {/* Icon */}
            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${persona.color} text-white mb-4`}>
              {persona.icon}
            </div>

            {/* Content */}
            <h3 className="text-xl font-bold mb-2">{persona.title}</h3>
            <p className="text-gray-600 mb-4">{persona.description}</p>

            {/* Quick Benefits */}
            <div className="space-y-2 mb-6">
              {persona.benefits.slice(0, 2).map((benefit, idx) => (
                <div key={idx} className="flex items-start space-x-2 text-sm">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${persona.color} mt-2`} />
                  <span className="text-gray-700">{benefit}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePersonaCta(persona.id);
              }}
              className={`w-full py-2 px-4 rounded-lg font-semibold transition-all ${
                selectedPersona === persona.id
                  ? `bg-gradient-to-r ${persona.color} text-white`
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {persona.cta}
            </button>

            {/* Selection Indicator */}
            {selectedPersona === persona.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-r ${persona.color} flex items-center justify-center`}
              >
                <span className="text-white text-sm">✓</span>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Detailed View */}
      {selectedPersona && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-br from-gray-50 to-white p-8 rounded-2xl border border-gray-200"
        >
          {(() => {
            const persona = PERSONAS.find(p => p.id === selectedPersona);
            if (!persona) return null;

            return (
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Journey Steps */}
                <div>
                  <h4 className="text-2xl font-bold mb-6 flex items-center">
                    <span className={`p-2 rounded-lg bg-gradient-to-r ${persona.color} text-white mr-3`}>
                      {persona.icon}
                    </span>
                    Your Journey
                  </h4>
                  
                  <div className="space-y-4">
                    {Object.entries(persona.journey).map(([step, description], idx) => (
                      <div key={step} className="flex items-start space-x-4">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-r ${persona.color} text-white flex items-center justify-center font-semibold text-sm flex-shrink-0`}>
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-gray-800">{description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features & Benefits */}
                <div>
                  <h4 className="text-2xl font-bold mb-6">What You Get</h4>
                  
                  <div className="space-y-6">
                    <div>
                      <h5 className="font-semibold mb-3 text-gray-800">Key Features</h5>
                      <div className="grid grid-cols-1 gap-2">
                        {persona.features.map((feature, idx) => (
                          <div key={idx} className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${persona.color}`} />
                            <span className="text-sm text-gray-700">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h5 className="font-semibold mb-3 text-gray-800">Benefits</h5>
                      <div className="grid grid-cols-1 gap-2">
                        {persona.benefits.map((benefit, idx) => (
                          <div key={idx} className="flex items-center space-x-3">
                            <span className="text-green-500">✓</span>
                            <span className="text-sm text-gray-700">{benefit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-8">
                    <button
                      type="button"
                      onClick={() => handlePersonaCta(persona.id)}
                      className={`w-full py-4 px-6 rounded-xl font-bold text-lg text-white bg-gradient-to-r ${persona.color} hover:scale-105 transition-transform shadow-lg`}
                    >
                      {persona.cta} - Free Trial
                    </button>
                    <p className="text-center text-sm text-gray-500 mt-2">
                      No credit card required • Start in 30 seconds
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </motion.div>
      )}
    </div>
  );
}