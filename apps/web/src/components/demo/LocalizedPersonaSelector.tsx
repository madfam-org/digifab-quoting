'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Building2, Lightbulb, GraduationCap, Briefcase } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface Persona {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
  featuresKeys: string[];
  benefitsKeys: string[];
  ctaKey: string;
  color: string;
  journeyKeys: {
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  };
}

const PERSONAS: Persona[] = [
  {
    id: 'diy-maker',
    titleKey: 'persona.diyMaker.title',
    descriptionKey: 'persona.diyMaker.description',
    icon: <Wrench size={48} />,
    color: 'from-blue-500 to-cyan-500',
    featuresKeys: [
      'persona.diyMaker.features.comparison',
      'persona.diyMaker.features.timeCalc',
      'persona.diyMaker.features.skillAssess',
      'persona.diyMaker.features.sourcing',
      'persona.diyMaker.features.tutorials',
    ],
    benefitsKeys: [
      'persona.diyMaker.benefits.savings',
      'persona.diyMaker.benefits.skills',
      'persona.diyMaker.benefits.decisions',
      'persona.diyMaker.benefits.community',
    ],
    ctaKey: 'persona.diyMaker.cta',
    journeyKeys: {
      step1: 'persona.diyMaker.journey.step1',
      step2: 'persona.diyMaker.journey.step2',
      step3: 'persona.diyMaker.journey.step3',
      step4: 'persona.diyMaker.journey.step4',
    },
  },
  {
    id: 'shop-owner',
    titleKey: 'persona.shopOwner.title',
    descriptionKey: 'persona.shopOwner.description',
    icon: <Building2 size={48} />,
    color: 'from-green-500 to-emerald-500',
    featuresKeys: [
      'persona.shopOwner.features.quoting',
      'persona.shopOwner.features.crm',
      'persona.shopOwner.features.margins',
      'persona.shopOwner.features.bulk',
      'persona.shopOwner.features.whiteLabel',
    ],
    benefitsKeys: [
      'persona.shopOwner.benefits.faster',
      'persona.shopOwner.benefits.revenue',
      'persona.shopOwner.benefits.time',
      'persona.shopOwner.benefits.professional',
    ],
    ctaKey: 'persona.shopOwner.cta',
    journeyKeys: {
      step1: 'persona.shopOwner.journey.step1',
      step2: 'persona.shopOwner.journey.step2',
      step3: 'persona.shopOwner.journey.step3',
      step4: 'persona.shopOwner.journey.step4',
    },
  },
  {
    id: 'product-designer',
    titleKey: 'persona.designer.title',
    descriptionKey: 'persona.designer.description',
    icon: <Lightbulb size={48} />,
    color: 'from-purple-500 to-violet-500',
    featuresKeys: [
      'persona.designer.features.dfm',
      'persona.designer.features.materials',
      'persona.designer.features.optimization',
      'persona.designer.features.validation',
      'persona.designer.features.cad',
    ],
    benefitsKeys: [
      'persona.designer.benefits.iterations',
      'persona.designer.benefits.costs',
      'persona.designer.benefits.validate',
      'persona.designer.benefits.practices',
    ],
    ctaKey: 'persona.designer.cta',
    journeyKeys: {
      step1: 'persona.designer.journey.step1',
      step2: 'persona.designer.journey.step2',
      step3: 'persona.designer.journey.step3',
      step4: 'persona.designer.journey.step4',
    },
  },
  {
    id: 'procurement',
    titleKey: 'persona.procurement.title',
    descriptionKey: 'persona.procurement.description',
    icon: <Briefcase size={48} />,
    color: 'from-orange-500 to-red-500',
    featuresKeys: [
      'persona.procurement.features.comparison',
      'persona.procurement.features.intelligence',
      'persona.procurement.features.bulk',
      'persona.procurement.features.analytics',
      'persona.procurement.features.trends',
    ],
    benefitsKeys: [
      'persona.procurement.benefits.negotiate',
      'persona.procurement.benefits.time',
      'persona.procurement.benefits.intelligence',
      'persona.procurement.benefits.tracking',
    ],
    ctaKey: 'persona.procurement.cta',
    journeyKeys: {
      step1: 'persona.procurement.journey.step1',
      step2: 'persona.procurement.journey.step2',
      step3: 'persona.procurement.journey.step3',
      step4: 'persona.procurement.journey.step4',
    },
  },
  {
    id: 'educator',
    titleKey: 'persona.educator.title',
    descriptionKey: 'persona.educator.description',
    icon: <GraduationCap size={48} />,
    color: 'from-indigo-500 to-blue-500',
    featuresKeys: [
      'persona.educator.features.pricing',
      'persona.educator.features.data',
      'persona.educator.features.projects',
      'persona.educator.features.collaboration',
      'persona.educator.features.curriculum',
    ],
    benefitsKeys: [
      'persona.educator.benefits.realData',
      'persona.educator.benefits.engage',
      'persona.educator.benefits.bridge',
      'persona.educator.benefits.prepare',
    ],
    ctaKey: 'persona.educator.cta',
    journeyKeys: {
      step1: 'persona.educator.journey.step1',
      step2: 'persona.educator.journey.step2',
      step3: 'persona.educator.journey.step3',
      step4: 'persona.educator.journey.step4',
    },
  },
];

export function LocalizedPersonaSelector() {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const { t } = useTranslation('personas');

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
            <div
              className={`absolute inset-0 bg-gradient-to-br ${persona.color} opacity-5 rounded-2xl`}
            />

            {/* Icon */}
            <div
              className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${persona.color} text-white mb-4`}
            >
              {persona.icon}
            </div>

            {/* Content */}
            <h3 className="text-xl font-bold mb-2">{t(persona.titleKey)}</h3>
            <p className="text-gray-600 mb-4">{t(persona.descriptionKey)}</p>

            {/* Quick Benefits */}
            <div className="space-y-2 mb-6">
              {persona.benefitsKeys.slice(0, 2).map((benefitKey, idx) => (
                <div key={idx} className="flex items-start space-x-2 text-sm">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${persona.color} mt-2`} />
                  <span className="text-gray-700">{t(benefitKey)}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              className={`w-full py-2 px-4 rounded-lg font-semibold transition-all ${
                selectedPersona === persona.id
                  ? `bg-gradient-to-r ${persona.color} text-white`
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(persona.ctaKey)}
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
            const persona = PERSONAS.find((p) => p.id === selectedPersona);
            if (!persona) return null;

            return (
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Journey Steps */}
                <div>
                  <h4 className="text-2xl font-bold mb-6 flex items-center">
                    <span
                      className={`p-2 rounded-lg bg-gradient-to-r ${persona.color} text-white mr-3`}
                    >
                      {persona.icon}
                    </span>
                    Tu Camino
                  </h4>

                  <div className="space-y-4">
                    {Object.entries(persona.journeyKeys).map(([step, key], idx) => (
                      <div key={step} className="flex items-start space-x-4">
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-r ${persona.color} text-white flex items-center justify-center font-semibold text-sm flex-shrink-0`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-gray-800">{t(key)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features & Benefits */}
                <div>
                  <h4 className="text-2xl font-bold mb-6">Lo Que Obtienes</h4>

                  <div className="space-y-6">
                    <div>
                      <h5 className="font-semibold mb-3 text-gray-800">Características Clave</h5>
                      <div className="grid grid-cols-1 gap-2">
                        {persona.featuresKeys.map((featureKey, idx) => (
                          <div key={idx} className="flex items-center space-x-3">
                            <div
                              className={`w-2 h-2 rounded-full bg-gradient-to-r ${persona.color}`}
                            />
                            <span className="text-sm text-gray-700">{t(featureKey)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h5 className="font-semibold mb-3 text-gray-800">Beneficios</h5>
                      <div className="grid grid-cols-1 gap-2">
                        {persona.benefitsKeys.map((benefitKey, idx) => (
                          <div key={idx} className="flex items-center space-x-3">
                            <span className="text-green-500">✓</span>
                            <span className="text-sm text-gray-700">{t(benefitKey)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-8">
                    <button
                      className={`w-full py-4 px-6 rounded-xl font-bold text-lg text-white bg-gradient-to-r ${persona.color} hover:scale-105 transition-transform shadow-lg`}
                    >
                      {t(persona.ctaKey)} - Prueba Gratis
                    </button>
                    <p className="text-center text-sm text-gray-500 mt-2">
                      Sin tarjeta de crédito • Comienza en 30 segundos
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
