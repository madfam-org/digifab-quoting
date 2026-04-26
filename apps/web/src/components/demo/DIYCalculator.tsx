'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Wrench,
  Building,
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Star,
  Calculator,
} from 'lucide-react';

interface ProjectConfig {
  complexity: 'simple' | 'medium' | 'complex';
  material: string;
  size: 'small' | 'medium' | 'large';
  quantity: number;
  urgency: 'standard' | 'rush';
}

interface CostBreakdown {
  materials: number;
  tools: number;
  time: number;
  learning: number;
  failure: number;
  total: number;
}

interface DIYOption {
  cost: CostBreakdown;
  timeHours: number;
  skillRequired: string;
  successRate: number;
  pros: string[];
  cons: string[];
}

interface ProfessionalOption {
  cost: number;
  timeHours: number;
  qualityGuarantee: boolean;
  pros: string[];
  cons: string[];
}

const MATERIAL_COSTS = {
  PLA: { costPerGram: 0.025, difficulty: 1 },
  PETG: { costPerGram: 0.035, difficulty: 1.2 },
  ABS: { costPerGram: 0.03, difficulty: 1.5 },
  Aluminum: { costPerGram: 0.08, difficulty: 3 },
  Steel: { costPerGram: 0.12, difficulty: 3.5 },
  'Carbon Fiber': { costPerGram: 0.15, difficulty: 2.5 },
};

const TOOLS_REQUIRED = {
  simple: { '3D Printer': 300, 'Basic Tools': 50 },
  medium: { '3D Printer': 300, 'Post-processing Tools': 150, Calipers: 30 },
  complex: { '3D Printer': 800, 'Advanced Tools': 400, 'Safety Equipment': 100 },
};

export function DIYCalculator() {
  const [config, setConfig] = useState<ProjectConfig>({
    complexity: 'simple',
    material: 'PLA',
    size: 'small',
    quantity: 1,
    urgency: 'standard',
  });

  const [userProfile, setUserProfile] = useState({
    hasTools: false,
    experience: 'beginner', // beginner, intermediate, expert
    valueTime: 25, // dollars per hour
  });

  const [results, setResults] = useState<{
    diy: DIYOption;
    professional: ProfessionalOption;
    recommendation: 'diy' | 'professional';
  } | null>(null);

  // Calculate costs whenever config changes
  useEffect(() => {
    calculateComparison();
  }, [config, userProfile]);

  const calculateComparison = () => {
    // DIY Calculation
    const materialCost = MATERIAL_COSTS[config.material as keyof typeof MATERIAL_COSTS];
    const sizeMultiplier = { small: 50, medium: 150, large: 400 }[config.size];
    const complexityMultiplier = { simple: 1, medium: 1.5, complex: 2.5 }[config.complexity];

    const materials = materialCost.costPerGram * sizeMultiplier * config.quantity;
    const tools = userProfile.hasTools
      ? 0
      : Object.values(TOOLS_REQUIRED[config.complexity]).reduce((a, b) => a + b, 0);

    // Time calculation (hours)
    const baseTime = { simple: 4, medium: 12, complex: 24 }[config.complexity];
    const experienceMultiplier = { beginner: 2, intermediate: 1.3, expert: 1 }[
      userProfile.experience as keyof { beginner: number; intermediate: number; expert: number }
    ];
    const timeHours = baseTime * experienceMultiplier * materialCost.difficulty;

    const timeValue = timeHours * userProfile.valueTime;

    // Learning curve (first-time cost)
    const learning =
      userProfile.experience === 'beginner' ? timeHours * 0.5 * userProfile.valueTime : 0;

    // Failure risk
    const successRate = Math.max(
      0.3,
      1 -
        materialCost.difficulty * 0.15 -
        complexityMultiplier * 0.1 +
        (userProfile.experience === 'expert'
          ? 0.2
          : userProfile.experience === 'intermediate'
            ? 0.1
            : 0),
    );
    const failureCost = materials * (1 - successRate) * 1.5; // 1.5x material cost for failures

    const diyCost: CostBreakdown = {
      materials: Math.round(materials),
      tools,
      time: Math.round(timeValue),
      learning: Math.round(learning),
      failure: Math.round(failureCost),
      total: Math.round(materials + tools + timeValue + learning + failureCost),
    };

    // Professional Calculation
    const professionalBaseCost = materials * 3; // 3x markup for professional service
    const rushMultiplier = config.urgency === 'rush' ? 1.5 : 1;
    const professionalCost = Math.round(
      professionalBaseCost * complexityMultiplier * rushMultiplier,
    );
    const professionalTime =
      config.urgency === 'rush' ? Math.max(24, baseTime * 0.3) : baseTime * 0.5;

    const diyOption: DIYOption = {
      cost: diyCost,
      timeHours: Math.round(timeHours),
      skillRequired:
        ['Beginner', 'Intermediate', 'Expert'][Math.floor(materialCost.difficulty - 1)] ||
        'Beginner',
      successRate: Math.round(successRate * 100),
      pros: [
        'Learn new skills',
        'Full creative control',
        'Satisfaction of making',
        userProfile.hasTools ? 'No new tools needed' : 'Build your toolkit',
        'Can iterate easily',
      ].slice(0, 4),
      cons: [
        `${Math.round(timeHours)} hours of work`,
        `${Math.round((1 - successRate) * 100)}% chance of failure`,
        tools > 0 ? `Need $${tools} in tools` : null,
        'Learning curve involved',
        'Quality may vary',
      ].filter(Boolean) as string[],
    };

    const professionalOption: ProfessionalOption = {
      cost: professionalCost,
      timeHours: Math.round(professionalTime),
      qualityGuarantee: true,
      pros: [
        'Professional quality',
        'No time investment',
        'Guaranteed results',
        'No tool investment',
        'Expert advice included',
      ],
      cons: [
        'Higher cost',
        'Less control over process',
        'No learning opportunity',
        config.urgency === 'rush' ? 'Rush fees apply' : 'Standard lead times',
        'Revision costs extra',
      ],
    };

    // Recommendation logic
    const costSavings = professionalCost - diyCost.total;

    let recommendation: 'diy' | 'professional' = 'diy';

    if (costSavings < 0) recommendation = 'professional'; // Professional is cheaper
    if (userProfile.experience === 'beginner' && config.complexity === 'complex')
      recommendation = 'professional';
    if (config.urgency === 'rush' && timeHours > 48) recommendation = 'professional';
    if (userProfile.valueTime > 50 && timeHours > 20) recommendation = 'professional';

    setResults({
      diy: diyOption,
      professional: professionalOption,
      recommendation,
    });
  };

  if (!results) return null;

  const savings = results.professional.cost - results.diy.cost.total;
  const timeDiff = results.diy.timeHours - results.professional.timeHours;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Configuration Panel */}
      <div className="bg-white rounded-2xl p-8 shadow-lg border">
        <h2 className="text-3xl font-bold mb-8 text-center flex items-center justify-center">
          <Calculator className="mr-3" />
          DIY vs Professional Calculator
        </h2>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Project Settings */}
          <div>
            <h3 className="text-xl font-semibold mb-6">Project Details</h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3">Complexity Level</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['simple', 'medium', 'complex'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setConfig((prev) => ({ ...prev, complexity: level }))}
                      className={`p-3 rounded-lg border-2 font-semibold capitalize transition-all ${
                        config.complexity === level
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3">Material</label>
                <select
                  value={config.material}
                  onChange={(e) => setConfig((prev) => ({ ...prev, material: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Object.keys(MATERIAL_COSTS).map((material) => (
                    <option key={material} value={material}>
                      {material}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-3">Size</label>
                  <select
                    value={config.size}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        size: e.target.value as 'small' | 'medium' | 'large',
                      }))
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={config.quantity}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* User Profile */}
          <div>
            <h3 className="text-xl font-semibold mb-6">Your Profile</h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3">Experience Level</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['beginner', 'intermediate', 'expert'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setUserProfile((prev) => ({ ...prev, experience: level }))}
                      className={`p-3 rounded-lg border-2 font-semibold capitalize transition-all ${
                        userProfile.experience === level
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={userProfile.hasTools}
                    onChange={(e) =>
                      setUserProfile((prev) => ({ ...prev, hasTools: e.target.checked }))
                    }
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium">I already have the required tools</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3">
                  Your time value: ${userProfile.valueTime}/hour
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={userProfile.valueTime}
                  onChange={(e) =>
                    setUserProfile((prev) => ({ ...prev, valueTime: parseInt(e.target.value) }))
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>$10</span>
                  <span>$100</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Comparison */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* DIY Option */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`bg-white rounded-2xl p-8 border-2 ${
            results.recommendation === 'diy' ? 'border-green-500 shadow-xl' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Wrench className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">DIY Route</h3>
                <p className="text-gray-600">Make it yourself</p>
              </div>
            </div>
            {results.recommendation === 'diy' && (
              <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold flex items-center">
                <Star className="w-4 h-4 mr-1" />
                Recommended
              </div>
            )}
          </div>

          {/* Cost Breakdown */}
          <div className="mb-6">
            <h4 className="font-semibold mb-4">Cost Breakdown</h4>
            <div className="space-y-3">
              {Object.entries(results.diy.cost)
                .filter(([key]) => key !== 'total')
                .map(
                  ([key, value]) =>
                    value > 0 && (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{key}:</span>
                        <span className="font-medium">${value}</span>
                      </div>
                    ),
                )}
              <div className="border-t pt-3 flex justify-between text-lg font-bold">
                <span>Total Cost:</span>
                <span className="text-blue-600">${results.diy.cost.total}</span>
              </div>
            </div>
          </div>

          {/* Time & Success */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Clock className="w-6 h-6 mx-auto mb-2 text-gray-600" />
              <div className="text-2xl font-bold">{results.diy.timeHours}h</div>
              <div className="text-sm text-gray-600">Time needed</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-gray-600" />
              <div className="text-2xl font-bold">{results.diy.successRate}%</div>
              <div className="text-sm text-gray-600">Success rate</div>
            </div>
          </div>

          {/* Pros & Cons */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h5 className="font-semibold mb-2 text-green-700">Pros</h5>
              <ul className="space-y-1">
                {results.diy.pros.map((pro, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-2 text-red-700">Cons</h5>
              <ul className="space-y-1">
                {results.diy.cons.map((con, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Professional Option */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`bg-white rounded-2xl p-8 border-2 ${
            results.recommendation === 'professional'
              ? 'border-green-500 shadow-xl'
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-100 rounded-xl">
                <Building className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Professional Service</h3>
                <p className="text-gray-600">Let experts handle it</p>
              </div>
            </div>
            {results.recommendation === 'professional' && (
              <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold flex items-center">
                <Star className="w-4 h-4 mr-1" />
                Recommended
              </div>
            )}
          </div>

          {/* Cost */}
          <div className="mb-6">
            <div className="text-center p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-purple-600" />
              <div className="text-3xl font-bold text-purple-600">${results.professional.cost}</div>
              <div className="text-sm text-gray-600">Total cost</div>
            </div>
          </div>

          {/* Time & Quality */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Clock className="w-6 h-6 mx-auto mb-2 text-gray-600" />
              <div className="text-2xl font-bold">{results.professional.timeHours}h</div>
              <div className="text-sm text-gray-600">Lead time</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <div className="text-2xl font-bold">100%</div>
              <div className="text-sm text-gray-600">Quality guarantee</div>
            </div>
          </div>

          {/* Pros & Cons */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h5 className="font-semibold mb-2 text-green-700">Pros</h5>
              <ul className="space-y-1">
                {results.professional.pros.map((pro, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-2 text-red-700">Cons</h5>
              <ul className="space-y-1">
                {results.professional.cons.map((con, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Summary & Recommendation */}
      <div
        className={`bg-gradient-to-r ${
          results.recommendation === 'diy'
            ? 'from-blue-500 to-cyan-500'
            : 'from-purple-500 to-pink-500'
        } text-white rounded-2xl p-8`}
      >
        <div className="text-center">
          <h3 className="text-3xl font-bold mb-4">
            Our Recommendation:{' '}
            {results.recommendation === 'diy' ? 'DIY Route' : 'Professional Service'}
          </h3>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <h4 className="font-bold mb-2">Cost Difference</h4>
              <div className="text-2xl font-bold">
                {savings > 0 ? `Save $${savings}` : `Pay $${Math.abs(savings)} more`}
              </div>
              <p className="text-sm opacity-90">
                {results.recommendation === 'diy'
                  ? 'by doing it yourself'
                  : 'but save time & stress'}
              </p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <h4 className="font-bold mb-2">Time Investment</h4>
              <div className="text-2xl font-bold">
                {timeDiff > 0 ? `+${timeDiff}h` : `${Math.abs(timeDiff)}h`}
              </div>
              <p className="text-sm opacity-90">
                {results.recommendation === 'diy' ? 'learning experience' : 'faster delivery'}
              </p>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <h4 className="font-bold mb-2">Success Rate</h4>
              <div className="text-2xl font-bold">
                {results.recommendation === 'diy' ? `${results.diy.successRate}%` : '100%'}
              </div>
              <p className="text-sm opacity-90">
                {results.recommendation === 'diy' ? 'first-time success' : 'guaranteed quality'}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <button className="bg-white text-gray-800 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors">
              {results.recommendation === 'diy'
                ? 'Get DIY Guide & Shopping List'
                : 'Get Professional Quotes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
