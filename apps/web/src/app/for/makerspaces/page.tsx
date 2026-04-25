import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, Users, Tags, Workflow, Code2, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'For makerspaces & service bureaus — white-label quoting | Cotiza Studio',
  description:
    'Give your members instant quoting under your brand. Multi-tenant, transaction-fee splits, RBAC, full API. Stop being a help desk. Start being a platform.',
  openGraph: {
    title: 'For makerspaces — white-label quoting your members will actually use',
    description:
      'Your domain, your brand, our engine. Multi-tenant, RBAC, API + webhooks. Schedule a demo.',
    type: 'website',
  },
};

const PAINS = [
  {
    pain: 'Members ping you on Slack 30 times a day asking "how much would this cost?"',
    fix: 'Self-serve quoting under your brand. They paste, they get a price, you stop being a help desk.',
  },
  {
    pain: 'You can\'t monetize the quotes happening on your own equipment.',
    fix: 'Transaction-fee splits to Dhanam on every order. You set the rate, we handle the rails.',
  },
  {
    pain: 'You\'d build your own quoting platform — but it\'s 18 months of engineering you don\'t have.',
    fix: 'Full white-label. Your domain, your brand, our engine. Live in days.',
  },
  {
    pain: 'You want analytics on member usage but everything lives in spreadsheets.',
    fix: 'Per-tenant audit logs, MetricsService dashboards, Forgesight pricing trends. Your data, your branding.',
  },
];

const CAPABILITIES = [
  { icon: Building2, title: 'Full white-label', body: 'Your domain, your brand, your customer list. We disappear into the background.' },
  { icon: Users, title: 'Member RBAC', body: 'owner / admin / contributor / viewer roles. JWT claims federate cleanly into your existing identity if you have one.' },
  { icon: Tags, title: 'Transaction-fee splits', body: 'Set your cut. Dhanam handles automatic payout splits to your account on every order.' },
  { icon: Workflow, title: 'Multi-tenant infrastructure', body: 'Per-tenant S3 prefixes, KMS keys, audit logs. Your data stays cleanly isolated from every other Cotiza tenant.' },
  { icon: Code2, title: 'API + signed webhooks', body: 'HMAC-SHA256 outbound webhooks for every quote, order, payment, CFDI event. Wire Slack, Notion, your CRM.' },
  { icon: ShieldCheck, title: 'CFDI-ready out of the box', body: 'Mexican-tenant orders auto-stamp via Karafiel. Per-tenant e.firma upload (Wave E) ships members on their own SAT identity.' },
];

export default function MakerspacesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="container mx-auto px-6 py-20 lg:py-24 max-w-5xl">
        <p className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-6 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5">
          <Building2 className="w-3 h-3" />
          For makerspaces & service bureaus
        </p>
        <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-4">
          Stop being a help desk.
          <span className="block text-primary mt-2">Start being a platform.</span>
        </h1>
        <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mb-8">
          For the makerspace, fab co-op, or service bureau franchise that wants
          its members quoting under its own brand — and wants a transaction
          fee on every order.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="mailto:hola@cotiza.studio?subject=Makerspace%20demo"
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Schedule a demo
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            See Enterprise pricing
          </Link>
        </div>
      </section>

      <section className="py-16 bg-muted/30 border-y border-border/40">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">The pains we kill for space operators</h2>
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
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">What ships in the white-label tier</h2>
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
          <h2 className="text-3xl font-bold mb-4">30 minutes, real numbers.</h2>
          <p className="text-lg text-muted-foreground mb-6">
            Most makerspace operators come in via a single call to scope brand,
            transaction-fee structure, and member migration. We'll send you
            sample numbers from a comparable space before the call.
          </p>
          <Link
            href="mailto:hola@cotiza.studio?subject=Makerspace%20demo"
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
          >
            Schedule the call →
          </Link>
        </div>
      </section>
    </main>
  );
}
