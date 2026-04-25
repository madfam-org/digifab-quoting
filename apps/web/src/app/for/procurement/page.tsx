import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  GitCompare,
  Activity,
  Globe2,
  ShieldCheck,
  Code2,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'For procurement teams — apples-to-apples manufacturing quoting | Cotiza Studio',
  description:
    'Stop chasing 5 vendors with 5 quote formats. Submit one spec, get standardized DFM-annotated quotes from every process side-by-side. Live Forgesight market pricing. Compliance-ready.',
  openGraph: {
    title: 'For procurement — one spec, every quote, real numbers',
    description:
      'Multi-vendor comparison. Live market pricing. Standardized DFM. Built for buyers who actually have to defend the choice.',
    type: 'website',
  },
};

const PAINS = [
  {
    pain: '5 vendors, 5 quote formats, 5 different "lead time" definitions.',
    fix: 'One spec in. Standardized side-by-side comparison out. Same DFM scoring, same units, same lead-time definition.',
  },
  {
    pain: '"Why are these aluminum quotes 2x apart?" "Different alloy assumptions." Every. Single. Time.',
    fix: 'DFM analysis exposes the assumptions every vendor hides. Material grade, finish, tolerance — all annotated.',
  },
  {
    pain: 'Boss wants to know if the quote is fair. Forgesight says aluminum 6061 dropped 8% this week. Your vendor didn\'t.',
    fix: 'Live Forgesight market pricing in every quote. Fair-price check baked in. Negotiation leverage included.',
  },
  {
    pain: 'Cross-border buyers seeing one number in MXN, another in USD, neither matches.',
    fix: '30+ currencies, geo-detected, live rates funneled through Dhanam (RFC 0011). One source of truth.',
  },
];

const CAPABILITIES = [
  { icon: GitCompare, title: 'Standardized multi-vendor compare', body: 'Same input → comparable outputs. DFM-annotated. Same units. Same lead-time definition. One PDF you can defend in a vendor review.' },
  { icon: Activity, title: 'Live market price benchmarks', body: 'Forgesight pricing feed runs in your DFM analysis. Aluminum 6061 spikes 12%? Your quote knows. Your vendor\'s quote should too.' },
  { icon: Globe2, title: '30+ currencies, geo-aware', body: 'MXN/USD/EUR/etc. Banxico FX rates. Funneled through Dhanam (RFC 0011). One number, every vendor, your buyer\'s currency.' },
  { icon: ShieldCheck, title: 'CFDI-ready by default', body: 'Mexican vendors auto-stamp legal CFDI 4.0 invoices via Karafiel. Compliance is not a separate workflow.' },
  { icon: Code2, title: 'API + webhook integration', body: 'Pull quotes into your existing ERP/SRM. Push approval events back. HMAC-SHA256 signed throughout.' },
];

export default function ProcurementPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="container mx-auto px-6 py-20 lg:py-24 max-w-5xl">
        <p className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-6 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5">
          <Briefcase className="w-3 h-3" />
          For procurement teams
        </p>
        <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-4">
          One spec in.
          <span className="block text-primary mt-2">
            Every quote, comparable.
          </span>
        </h1>
        <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mb-8">
          For the buyer who has to defend a vendor choice in front of a cost
          review. Stop chasing 5 different quote formats. Stop assuming
          "lead time" means the same thing to every shop. One spec, every
          quote, all in your currency.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth/register?source=procurement"
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Start 14-day Business trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/try"
            className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            Run one comparison as a guest
          </Link>
        </div>
      </section>

      <section className="py-16 bg-muted/30 border-y border-border/40">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">The pains we kill for procurement</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PAINS.map((p, i) => (
              <article key={i} className="rounded-lg border border-border/60 bg-card p-6">
                <p className="text-sm font-mono uppercase tracking-wider text-destructive/80 mb-2">Pain</p>
                <p className="font-medium mb-4">{p.pain}</p>
                <p className="text-sm font-mono uppercase tracking-wider text-primary/80 mb-2">Fix</p>
                <p className="text-sm text-muted-foreground">{p.fix}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">What ships on the Business tier</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-lg border border-border/60 bg-card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-6 text-center max-w-3xl">
          <h2 className="text-3xl font-bold mb-4">Defend a vendor choice in 14 days.</h2>
          <p className="text-lg text-muted-foreground mb-6">
            Run a real RFQ through the platform during the trial. If the
            comparison doesn't make your next vendor review meeting easier,
            the free tier is yours forever.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
          >
            See pricing →
          </Link>
        </div>
      </section>
    </main>
  );
}
