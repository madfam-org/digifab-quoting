import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Briefcase, Clock, Workflow, Activity, Wrench } from 'lucide-react';

export const metadata: Metadata = {
  title: 'For design consultants & engineering firms — services-mode quoting | Cotiza Studio',
  description:
    'Bill design hours, fixed fees, and milestones — first-class. Group fab + services under one engagement. DFM analysis on every CAD upload. Built for consultancies that quote both work and parts.',
  openGraph: {
    title: 'For consultants — services-mode quoting that talks to your CRM',
    description:
      'Hourly, fixed-fee, milestone billing. Engagement projection. Per-milestone Dhanam invoices. DFM included.',
    type: 'website',
  },
};

const PAINS = [
  {
    pain: 'Quoting design hours in a separate tool from quoting parts.',
    fix: 'Services-mode quoting (hourly / fixed-fee / milestone) lives in the same engine that prices a CNC part.',
  },
  {
    pain: 'Tracking 8 quotes for one client across email, Notion, and your CRM.',
    fix: 'PhyneCRM engagement projection: every quote auto-links to the client engagement. Fab + services side by side.',
  },
  {
    pain: 'Manually invoicing every milestone of a 4-stage project.',
    fix: 'Per-milestone invoices fan out to Dhanam automatically when you mark each stage complete.',
  },
  {
    pain: 'Giving DFM advice without real material costs to back it up.',
    fix: 'Forgesight market pricing runs in your DFM analysis. Cite real numbers, not "approximately."',
  },
];

const CAPABILITIES = [
  {
    icon: Briefcase,
    title: 'Services-mode billing',
    body: 'hourly, fixed-fee, milestone — first-class billable types. Same UX as a parts quote.',
  },
  {
    icon: Workflow,
    title: 'Engagement projection',
    body: 'PhyneCRM-synced engagement table groups fab + services quotes for the same client. Two-quotes-per-engagement is the canonical flow.',
  },
  {
    icon: Clock,
    title: 'Per-milestone invoicing',
    body: 'Mark a milestone complete → Dhanam issues an invoice with stable Idempotency-Key. No manual double-entry.',
  },
  {
    icon: Wrench,
    title: 'DFM on every upload',
    body: 'Python geometry worker runs cost-reducing analysis. Material substitution, process recommendation, redesign hints.',
  },
  {
    icon: Activity,
    title: 'Live market pricing',
    body: 'Forgesight feed inside your DFM. Quote design-time decisions with real-time material cost data.',
  },
];

export default function ConsultantsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="container mx-auto px-6 py-20 lg:py-24 max-w-5xl">
        <p className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-6 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5">
          <Briefcase className="w-3 h-3" />
          For design consultants & engineering firms
        </p>
        <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-4">
          You bill hours, not parts.
          <span className="block text-primary mt-2">We quote both.</span>
        </h1>
        <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mb-8">
          For the design firm, engineering boutique, or fab consultancy that invoices in hours,
          fixed fees, and milestones — and still needs to quote actual parts. Same platform. Same
          engagement. One place.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth/register?source=consultants"
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Start 14-day Creator Pro trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            See full feature surface
          </Link>
        </div>
      </section>

      <section className="py-16 bg-muted/30 border-y border-border/40">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">
            The pains we kill for consultancies
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PAINS.map((p, i) => (
              <article key={i} className="rounded-lg border border-border/60 bg-card p-6">
                <p className="text-sm font-mono uppercase tracking-wider text-destructive/80 mb-2">
                  Pain
                </p>
                <p className="font-medium mb-4">{p.pain}</p>
                <p className="text-sm font-mono uppercase tracking-wider text-primary/80 mb-2">
                  Fix
                </p>
                <p className="text-sm text-muted-foreground">{p.fix}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">
            What ships on the Pro tier
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
          <h2 className="text-3xl font-bold mb-4">Try one engagement on us.</h2>
          <p className="text-lg text-muted-foreground mb-6">
            Run a real client through services-mode for 14 days. If it doesn't save you 4 billable
            hours of admin a week, the free tier is yours for life.
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
