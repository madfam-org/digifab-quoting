import { Suspense } from 'react';
import { InteractiveDemoLanding } from '@/components/demo/InteractiveDemoLanding';
import { FileUploadDemo } from '@/components/demo/FileUploadDemo';
import { DIYCalculator } from '@/components/demo/DIYCalculator';
import Link from 'next/link';
import { ArrowLeft, Zap, Calculator, Upload } from 'lucide-react';

export const metadata = {
  title: 'Try Cotiza Studio - Interactive Manufacturing Quote Demo',
  description:
    'Upload your files and get instant manufacturing quotes. Compare materials, calculate ROI, and optimize your designs in real-time.',
  keywords: 'manufacturing demo, 3D printing calculator, CNC cost estimator, instant quote tool',
};

export default function TryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Navigation Header */}
      <div className="bg-white border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Interactive Demo
          </h1>
          <Link
            href="/auth/register"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Sign Up Free
          </Link>
        </div>
      </div>

      {/* Demo Tools Navigation */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-8">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-6">Choose Your Tool</h2>
          <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <a
              href="#upload"
              className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              <Upload className="w-8 h-8 mb-2" />
              <span className="font-semibold">File Upload</span>
              <span className="text-xs opacity-75">Get instant quotes</span>
            </a>
            <a
              href="#interactive"
              className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              <Zap className="w-8 h-8 mb-2" />
              <span className="font-semibold">Live Demo</span>
              <span className="text-xs opacity-75">See it in action</span>
            </a>
            <a
              href="#diy"
              className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              <Calculator className="w-8 h-8 mb-2" />
              <span className="font-semibold">DIY vs Buy</span>
              <span className="text-xs opacity-75">Make decisions</span>
            </a>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="interactive" className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Live Manufacturing Quote Demo</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              See real-time pricing calculations as you explore different materials and processes
            </p>
          </div>
          <Suspense fallback={<div className="h-96 bg-gray-100 animate-pulse rounded-lg" />}>
            <InteractiveDemoLanding />
          </Suspense>
        </div>
      </section>

      {/* File Upload Demo */}
      <section id="upload" className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-8">Upload Your Own Files</h3>
            <p className="text-xl text-gray-600 text-center mb-8 max-w-3xl mx-auto">
              Drop your STL, STEP, or DXF files to get instant quotes with optimization suggestions
            </p>
            <FileUploadDemo />
          </div>
        </div>
      </section>

      {/* DIY vs Professional Calculator */}
      <section id="diy" className="py-20 bg-gradient-to-br from-orange-50 to-red-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Should You DIY or Use Our Service?</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Calculate the true cost of doing it yourself including time, tools, and materials
            </p>
          </div>
          <DIYCalculator />
        </div>
      </section>

      {/* Results Summary & CTA */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Save on Your Next Project?</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            You've seen the savings. You've compared the options. Now let's make it happen with your
            actual projects.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/auth/register"
              className="bg-white text-purple-600 px-8 py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-2xl"
            >
              Start Free 14-Day Trial
            </Link>
            <Link href="/quote/new" className="text-white underline hover:no-underline text-lg">
              or continue as guest →
            </Link>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div>
              <div className="text-3xl font-bold mb-2">No Credit Card</div>
              <div className="opacity-75">Required for trial</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-2">Unlimited Quotes</div>
              <div className="opacity-75">During trial period</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-2">Cancel Anytime</div>
              <div className="opacity-75">No questions asked</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
