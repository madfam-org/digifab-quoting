'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const HERO_EXAMPLES = [
  {
    title: 'Phone Case',
    originalCost: 847,
    optimizedCost: 312,
    process: '3D Printing → Injection Molding',
    material: 'PLA → ABS',
    improvement: 'Stronger & 63% cheaper',
  },
  {
    title: 'Drone Component',
    originalCost: 234,
    optimizedCost: 89,
    process: 'CNC Aluminum → 3D Print PETG',
    material: '6061-T6 → Carbon Fiber PETG',
    improvement: 'Lighter & 62% cheaper',
  },
  {
    title: 'Medical Device Part',
    originalCost: 1200,
    optimizedCost: 450,
    process: 'Traditional Machining → Precision 3D Print',
    material: 'Stainless Steel → Medical Grade Resin',
    improvement: 'Biocompatible & 62% cheaper',
  },
];

export function DemoHero() {
  const [currentExample, setCurrentExample] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentExample((prev) => (prev + 1) % HERO_EXAMPLES.length);
        setIsAnimating(false);
      }, 500);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const example = HERO_EXAMPLES[currentExample];

  return (
    <div className="relative py-20 overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800" />
      <div className="absolute inset-0 bg-black/20" />

      {/* Floating Particles */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white/20 rounded-full"
            animate={{
              y: [0, -100, 0],
              x: [0, Math.random() * 50 - 25, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
          />
        ))}
      </div>

      <div className="relative container mx-auto px-6 text-center text-white">
        {/* Main Headline */}
        <motion.h1
          className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          Manufacturing Costs
          <br />
          <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
            Solved in Seconds
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          className="text-xl md:text-2xl mb-12 opacity-90 max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Get instant quotes for 3D printing, CNC machining, and laser cutting. Compare materials,
          optimize designs, and make informed decisions.
        </motion.p>

        {/* Live Example Showcase */}
        <motion.div
          className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-4xl mx-auto border border-white/20"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Cost Comparison */}
            <div className="text-left">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentExample}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.5 }}
                >
                  <h3 className="text-2xl font-bold mb-4">{example.title}</h3>

                  <div className="space-y-4">
                    {/* Original Cost */}
                    <div className="flex items-center justify-between p-3 bg-red-500/20 rounded-lg border border-red-400/30">
                      <span>Traditional Quote:</span>
                      <span className="text-2xl font-bold text-red-300 line-through">
                        ${example.originalCost}
                      </span>
                    </div>

                    {/* Optimized Cost */}
                    <div className="flex items-center justify-between p-3 bg-green-500/20 rounded-lg border border-green-400/30">
                      <span>Cotiza Studio Optimized:</span>
                      <motion.span
                        className="text-3xl font-bold text-green-300"
                        animate={{ scale: isAnimating ? [1, 1.1, 1] : 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        ${example.optimizedCost}
                      </motion.span>
                    </div>

                    {/* Improvement Badge */}
                    <div className="text-center">
                      <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-4 py-2 rounded-full font-semibold">
                        {example.improvement}
                      </span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Process Visualization */}
            <div className="space-y-4">
              <div className="text-center">
                <span className="text-sm uppercase tracking-wide opacity-75">
                  Optimization Applied
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`process-${currentExample}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-3"
                >
                  <div className="p-3 bg-blue-500/20 rounded-lg border border-blue-400/30">
                    <span className="text-sm opacity-75">Process:</span>
                    <div className="font-semibold">{example.process}</div>
                  </div>

                  <div className="p-3 bg-purple-500/20 rounded-lg border border-purple-400/30">
                    <span className="text-sm opacity-75">Material:</span>
                    <div className="font-semibold">{example.material}</div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Time Indicator */}
              <div className="text-center">
                <motion.div
                  className="inline-flex items-center space-x-2 text-sm opacity-75"
                  animate={{ opacity: isAnimating ? [0.75, 0.3, 0.75] : 0.75 }}
                >
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span>Analysis completed in 0.3 seconds</span>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Progress Dots */}
          <div className="flex justify-center space-x-2 mt-6">
            {HERO_EXAMPLES.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentExample(index)}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === currentExample ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <button className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-8 py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-xl">
            Try It Now - Upload Your Design
          </button>
          <p className="text-sm opacity-75 mt-2">No signup required • Results in seconds</p>
        </motion.div>
      </div>
    </div>
  );
}
