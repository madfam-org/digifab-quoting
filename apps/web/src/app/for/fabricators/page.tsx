import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Factory, ShieldCheck, Workflow, Activity, Building2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'For Mexican fabricators — CFDI 4.0 + NOM-151 ready quoting | Cotiza Studio',
  description:
    'Quote any geometry in 60 seconds. Auto-stamp CFDI on every order. Dispatch jobs to Pravara MES. Bring your own e.firma. Built for the Mexican fab shop that stops waiting.',
  openGraph: {
    title: 'For Mexican fabricators — quote in 60s, CFDI auto-stamped',
    description:
      'Stop spending 4 hours/day cotizing and 2 hours in CFDI paperwork. One platform. Whole workflow.',
    type: 'website',
  },
};

const PAINS = [
  {
    pain: 'Spending 4 hours a day quoting and 2 hours on CFDI paperwork.',
    fix: '60 seconds per quote. CFDI auto-stamps on every order via Karafiel.',
  },
  {
    pain: 'Customers asking for SLA + lead time + CFDI + NOM-151 in five separate emails.',
    fix: 'One quote PDF carries everything. Legally admissible from the moment your customer signs.',
  },
  {
    pain: 'MES + ERP + accounting living in separate spreadsheets.',
    fix: 'Quote → order → Pravara MES dispatch → Dhanam invoice → Karafiel CFDI. One spec, full pipeline.',
  },
  {
    pain: 'Wanting to issue CFDIs from your own e.firma but stuck on a shared one.',
    fix: 'Per-tenant e.firma upload (Wave E, shipping). Your RFC, your emisor identity.',
  },
];

const CAPABILITIES = [
  { icon: Factory, title: '60-second quoting', body: 'Paste a STEP file, a Thingiverse link, or a service scope. CNC, 3D print, laser. Side-by-side cost + lead-time comparison.' },
  { icon: ShieldCheck, title: 'CFDI 4.0 auto-stamping', body: 'Karafiel timbra cada orden. Complemento de pago, NOM-151 timestamping, Article 69-B blacklist screening included.' },
  { icon: Workflow, title: 'Pravara MES dispatch', body: 'Every fab item on an accepted quote becomes a Pravara MES job with engagement linkage. Status webhooks back to your dashboard.' },
  { icon: Activity, title: 'Live Forgesight market pricing', body: 'Aluminum 6061 spikes 12%? Your DFM analysis cites the new number before your customer asks why.' },
  { icon: Building2, title: 'Per-tenant e.firma + multi-tenant', body: 'Bring your own SAT-issued cert. Per-tenant S3 prefixes, KMS keys, audit logs. White-label for your customers.' },
];

export default function FabricatorsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="container mx-auto px-6 py-20 lg:py-24 max-w-5xl">
        <p className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-6 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5">
          <Factory className="w-3 h-3" />
          For Mexican fabricators
        </p>
        <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-4">
          Quote in 60 seconds.
          <span className="block text-primary mt-2">CFDI in zero.</span>
        </h1>
        <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mb-8">
          For the fab shop that runs 10–500 jobs a month and can't ship a
          single one without a CFDI 4.0. Stop quoting like it's 2014.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth/register?source=fabricators"
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Start 14-day Business trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/try"
            className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            Run one quote as a guest
          </Link>
        </div>
      </section>

      <section className="py-16 bg-muted/30 border-y border-border/40">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">The pains we kill for fab shops</h2>
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
          <h2 className="text-2xl lg:text-3xl font-bold mb-10 text-center">Capabilities that ship today</h2>
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
          <h2 className="text-3xl font-bold mb-4">Want a per-tenant CFDI flow + SLA?</h2>
          <p className="text-lg text-muted-foreground mb-6">
            Most fab-shop customers come in via a 30-minute call to scope their
            existing PAC contract, e.firma situation, and Pravara MES integration.
            Self-serve checkout is also fine — start the Business trial and we'll
            scope upgrades from there.
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
