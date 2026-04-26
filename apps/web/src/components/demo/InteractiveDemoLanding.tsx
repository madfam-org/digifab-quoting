'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Zap, TrendingDown, Clock, DollarSign, Settings } from 'lucide-react';

interface MaterialOption {
  id: string;
  name: string;
  cost: number;
  properties: string[];
  color: string;
}

interface ProcessOption {
  id: string;
  name: string;
  multiplier: number;
  leadTime: number;
  description: string;
}

const MATERIALS: MaterialOption[] = [
  {
    id: 'pla',
    name: 'PLA',
    cost: 25,
    properties: ['Biodegradable', 'Easy to print', 'Low temp'],
    color: 'bg-green-500',
  },
  {
    id: 'petg',
    name: 'PETG',
    cost: 35,
    properties: ['Chemical resistant', 'Clear', 'Strong'],
    color: 'bg-blue-500',
  },
  {
    id: 'aluminum',
    name: 'Aluminum 6061',
    cost: 120,
    properties: ['Lightweight', 'Corrosion resistant', 'Machinable'],
    color: 'bg-gray-500',
  },
  {
    id: 'carbon',
    name: 'Carbon Fiber',
    cost: 250,
    properties: ['Ultra light', 'High strength', 'Premium'],
    color: 'bg-black',
  },
];

const PROCESSES: ProcessOption[] = [
  {
    id: '3d-print',
    name: '3D Printing',
    multiplier: 1,
    leadTime: 2,
    description: 'Perfect for prototypes and complex geometries',
  },
  {
    id: 'cnc',
    name: 'CNC Machining',
    multiplier: 2.5,
    leadTime: 5,
    description: 'High precision, great surface finish',
  },
  {
    id: 'injection',
    name: 'Injection Molding',
    multiplier: 0.3,
    leadTime: 14,
    description: 'Best for high volumes (1000+ parts)',
  },
];

const QUANTITIES = [1, 10, 100, 1000];

export function InteractiveDemoLanding() {
  const [selectedMaterial, setSelectedMaterial] = useState(MATERIALS[0]);
  const [selectedProcess, setSelectedProcess] = useState(PROCESSES[0]);
  const [quantity, setQuantity] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculate costs
  const baseCost = selectedMaterial.cost * selectedProcess.multiplier;
  const quantityDiscount = quantity >= 100 ? 0.7 : quantity >= 10 ? 0.85 : 1;
  const totalCost = Math.round(baseCost * quantity * quantityDiscount);
  const unitCost = Math.round(totalCost / quantity);
  const leadTime = Math.max(1, selectedProcess.leadTime - (quantity >= 100 ? 3 : 0));

  // Trigger calculation animation when values change
  useEffect(() => {
    setIsCalculating(true);
    const timer = setTimeout(() => setIsCalculating(false), 800);
    return () => clearTimeout(timer);
  }, [selectedMaterial, selectedProcess, quantity]);

  return (
    <div className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Experience the Magic</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Watch costs update in real-time as you experiment with different materials, processes,
            and quantities
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Interactive Controls */}
            <div className="space-y-8">
              {/* Material Selection */}
              <div>
                <h3 className="text-2xl font-semibold mb-4 flex items-center">
                  <Settings className="mr-2" />
                  Choose Material
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {MATERIALS.map((material) => (
                    <motion.button
                      key={material.id}
                      onClick={() => setSelectedMaterial(material)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selectedMaterial.id === material.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center mb-2">
                        <div className={`w-4 h-4 rounded ${material.color} mr-2`} />
                        <span className="font-semibold">{material.name}</span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        {material.properties.map((prop, idx) => (
                          <div key={idx}>• {prop}</div>
                        ))}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Process Selection */}
              <div>
                <h3 className="text-2xl font-semibold mb-4 flex items-center">
                  <Zap className="mr-2" />
                  Manufacturing Process
                </h3>
                <div className="space-y-3">
                  {PROCESSES.map((process) => (
                    <motion.button
                      key={process.id}
                      onClick={() => setSelectedProcess(process)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        selectedProcess.id === process.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold">{process.name}</span>
                        <span className="text-sm text-gray-500">{process.leadTime}d lead time</span>
                      </div>
                      <p className="text-sm text-gray-600">{process.description}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Quantity Selection */}
              <div>
                <h3 className="text-2xl font-semibold mb-4">Quantity</h3>
                <div className="grid grid-cols-4 gap-3">
                  {QUANTITIES.map((qty) => (
                    <motion.button
                      key={qty}
                      onClick={() => setQuantity(qty)}
                      className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                        quantity === qty
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {qty}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results Panel */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-8 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold">Live Quote</h3>
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-3 h-3 rounded-full ${isCalculating ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}
                  />
                  <span className="text-sm text-gray-600">
                    {isCalculating ? 'Calculating...' : 'Up to date'}
                  </span>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selectedMaterial.id}-${selectedProcess.id}-${quantity}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Primary Metrics */}
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="text-center p-6 bg-white rounded-xl shadow-sm">
                      <DollarSign className="mx-auto mb-2 text-green-600" size={32} />
                      <div className="text-3xl font-bold text-green-600">${totalCost}</div>
                      <div className="text-sm text-gray-600">Total Cost</div>
                      <div className="text-xs text-gray-500 mt-1">${unitCost} per unit</div>
                    </div>

                    <div className="text-center p-6 bg-white rounded-xl shadow-sm">
                      <Clock className="mx-auto mb-2 text-blue-600" size={32} />
                      <div className="text-3xl font-bold text-blue-600">{leadTime}</div>
                      <div className="text-sm text-gray-600">Days</div>
                      <div className="text-xs text-gray-500 mt-1">Lead Time</div>
                    </div>
                  </div>

                  {/* Cost Breakdown */}
                  <div className="bg-white rounded-xl p-6 mb-6">
                    <h4 className="font-semibold mb-4">Cost Breakdown</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>Material ({selectedMaterial.name}):</span>
                        <span>${selectedMaterial.cost * quantity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Process ({selectedProcess.name}):</span>
                        <span>×{selectedProcess.multiplier}</span>
                      </div>
                      {quantity >= 10 && (
                        <div className="flex justify-between text-green-600">
                          <span>Volume discount:</span>
                          <span>-{Math.round((1 - quantityDiscount) * 100)}%</span>
                        </div>
                      )}
                      <div className="border-t pt-3 flex justify-between font-semibold">
                        <span>Total:</span>
                        <span>${totalCost}</span>
                      </div>
                    </div>
                  </div>

                  {/* Smart Recommendations */}
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-6 border border-yellow-200">
                    <div className="flex items-start space-x-3">
                      <TrendingDown className="text-orange-500 mt-1" size={20} />
                      <div>
                        <h5 className="font-semibold text-orange-800 mb-2">💡 Smart Suggestion</h5>
                        {quantity === 1 && (
                          <p className="text-sm text-orange-700">
                            Consider ordering 10 units to save 15% per part
                          </p>
                        )}
                        {quantity >= 100 && selectedProcess.id !== 'injection' && (
                          <p className="text-sm text-orange-700">
                            For 100+ parts, injection molding could save 70% per unit
                          </p>
                        )}
                        {selectedMaterial.id === 'pla' && selectedProcess.id === 'cnc' && (
                          <p className="text-sm text-orange-700">
                            PLA isn't suitable for CNC. Try PETG or Aluminum for better results
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="mt-8 space-y-3">
                <button className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                  Get Detailed Quote
                </button>
                <button className="w-full border border-gray-300 py-3 px-6 rounded-xl font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center">
                  <Upload className="mr-2" size={20} />
                  Upload Your Design
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="text-blue-600" size={32} />
            </div>
            <h4 className="text-xl font-semibold mb-2">Instant Results</h4>
            <p className="text-gray-600">
              Get quotes in seconds, not days. See costs update in real-time as you make changes.
            </p>
          </div>

          <div className="text-center">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="text-green-600" size={32} />
            </div>
            <h4 className="text-xl font-semibold mb-2">Cost Optimization</h4>
            <p className="text-gray-600">
              Smart suggestions to reduce costs while maintaining quality and functionality.
            </p>
          </div>

          <div className="text-center">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="text-purple-600" size={32} />
            </div>
            <h4 className="text-xl font-semibold mb-2">Multiple Options</h4>
            <p className="text-gray-600">
              Compare different materials, processes, and quantities to find the perfect solution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
