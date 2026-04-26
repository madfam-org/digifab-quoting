import type { Metadata } from 'next';
import { PricingTiers } from '@/components/demo/PricingTiers';

export const metadata: Metadata = {
  title: 'Pricing — Cotiza Studio',
  description:
    'Choose the plan that fits your manufacturing journey. Free for hobbyists, scale up as your needs grow. All plans include AI-powered quote optimization.',
  openGraph: {
    title: 'Pricing — Cotiza Studio',
    description:
      'Free for hobbyists. Scale up as you grow. AI-powered manufacturing quotes for makers, shops, designers, and enterprises.',
    type: 'website',
  },
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <header className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-lg text-muted-foreground">
            Choose the perfect plan for your needs. Start free, upgrade anytime, cancel whenever.
            14-day free trial on all paid plans — no credit card required.
          </p>
        </header>
        <PricingTiers />
      </section>
    </main>
  );
}
