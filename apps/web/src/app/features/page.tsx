import type { Metadata } from 'next';
import Link from 'next/link';
import { Zap, Cpu, Layers, Briefcase, BarChart3, Plug } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Features — Cotiza Studio',
  description:
    'Lightning-fast quotes, AI-powered design optimization, multiple manufacturing processes, and seamless integrations. Everything you need to make informed manufacturing decisions.',
  openGraph: {
    title: 'Features — Cotiza Studio',
    description:
      'Lightning-fast quotes. AI-powered optimization. Multiple processes. Built for makers, shops, designers, and procurement teams.',
    type: 'website',
  },
};

const features = [
  {
    icon: Zap,
    title: 'Lightning-Fast Quotes',
    description: 'Get manufacturing quotes in seconds, not days.',
    benefits: [
      'Results in under 3 seconds',
      'Process 100+ files simultaneously',
      'Real-time cost updates',
      'No waiting for email responses',
    ],
  },
  {
    icon: Cpu,
    title: 'AI-Powered Optimization',
    description:
      'Reduce costs while maintaining quality with smart suggestions.',
    benefits: [
      'Automatic process recommendations',
      'Material substitution analysis',
      'Geometry-aware DFM hints',
      'Average 63% cost reduction',
    ],
  },
  {
    icon: Layers,
    title: 'Multiple Manufacturing Processes',
    description:
      'Compare 3D printing, CNC machining, laser cutting, and more.',
    benefits: [
      'FFF and SLA 3D printing',
      '3-axis CNC for aluminum, steel, plastics',
      '2D laser cutting',
      'Side-by-side process comparison',
    ],
  },
  {
    icon: Briefcase,
    title: 'Business-Ready Features',
    description:
      'Professional tools for shops, makerspaces, and enterprises.',
    benefits: [
      'Customer management',
      'Team collaboration',
      'White-label options',
      'Advanced analytics',
    ],
  },
  {
    icon: BarChart3,
    title: 'Market Intelligence',
    description: 'Access real-time pricing data and industry trends.',
    benefits: [
      'Forgesight pricing feed integration',
      'Material cost benchmarks',
      'Vendor comparison data',
      'Regional pricing insights',
    ],
  },
  {
    icon: Plug,
    title: 'Seamless Integrations',
    description: 'Connect with your existing tools and workflows.',
    benefits: [
      'REST API + webhooks',
      'Stripe payments via Dhanam',
      'CFDI invoicing via Karafiel',
      'PhyneCRM engagement sync',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <header className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            Powerful Features for Every Need
          </h1>
          <p className="text-lg text-muted-foreground">
            From instant quotes to market intelligence, Cotiza Studio provides
            everything you need to make informed manufacturing decisions.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map(({ icon: Icon, title, description, benefits }) => (
            <article
              key={title}
              className="rounded-lg border p-6 hover:shadow-md transition-shadow"
            >
              <div className="rounded-md bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">{title}</h2>
              <p className="text-muted-foreground mb-4">{description}</p>
              <ul className="space-y-2 text-sm">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span aria-hidden className="text-primary">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            See pricing →
          </Link>
        </div>
      </section>
    </main>
  );
}
