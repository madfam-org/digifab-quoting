'use client';

import { Suspense } from 'react';
import { LinkQuoteDemo } from '@/components/demo/LinkQuoteDemo';
import { PricingTiers } from '@/components/demo/PricingTiers';
import Link from 'next/link';
import {
  ArrowRight,
  Zap,
  Globe,
  Activity,
  ShieldCheck,
  Workflow,
  Building2,
  Code2,
  Languages,
  Wrench,
  CheckCircle2,
  Factory,
  Briefcase,
  Hammer,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

// Single source of truth — measured/targeted SLOs only.
// We deliberately removed inflated vanity metrics (10,000+ users, 63%
// average savings) on 2026-04-25 per the trust-first rewrite.
const STATS_KEYS = ['apiLatency', 'fullQuote', 'currencies', 'uptime'] as const;

const STATS_ICONS: Record<(typeof STATS_KEYS)[number], JSX.Element> = {
  apiLatency: <Zap className="w-5 h-5" />,
  fullQuote: <Activity className="w-5 h-5" />,
  currencies: <Globe className="w-5 h-5" />,
  uptime: <ShieldCheck className="w-5 h-5" />,
};

const PAIN_KEYS = [
  'quoteTurnaround',
  'bomExtraction',
  'cfdiPaperwork',
  'multiVendor',
  'designIteration',
  'currencyChaos',
] as const;

const PERSONA_KEYS = ['fabricator', 'consultant', 'makerspace', 'diy'] as const;

const PERSONA_ICONS: Record<(typeof PERSONA_KEYS)[number], JSX.Element> = {
  fabricator: <Factory className="w-6 h-6" />,
  consultant: <Briefcase className="w-6 h-6" />,
  makerspace: <Building2 className="w-6 h-6" />,
  diy: <Hammer className="w-6 h-6" />,
};

const PERSONA_HREF: Record<(typeof PERSONA_KEYS)[number], string> = {
  fabricator: '/for/fabricators',
  consultant: '/for/consultants',
  makerspace: '/for/makerspaces',
  diy: '/try',
};

const FEATURE_KEYS = [
  'fast',
  'services',
  'compliance',
  'ecosystem',
  'intelligence',
  'multitenant',
  'api',
  'i18n',
  'dfm',
] as const;

const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], JSX.Element> = {
  fast: <Zap className="w-5 h-5" />,
  services: <Briefcase className="w-5 h-5" />,
  compliance: <ShieldCheck className="w-5 h-5" />,
  ecosystem: <Workflow className="w-5 h-5" />,
  intelligence: <Activity className="w-5 h-5" />,
  multitenant: <Building2 className="w-5 h-5" />,
  api: <Code2 className="w-5 h-5" />,
  i18n: <Languages className="w-5 h-5" />,
  dfm: <Wrench className="w-5 h-5" />,
};

const TRUST_KEYS = ['karafiel', 'dhanam', 'pravara', 'phynecrm', 'forgesight'] as const;

export function LocalizedHomePage() {
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO — pain-first headline, no inflated stats */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" aria-hidden />
        <div className="container mx-auto px-6 py-20 lg:py-28 relative">
          <div className="max-w-4xl mx-auto text-center">
            <p className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-6 px-3 py-1.5 rounded-full border border-border/60 bg-card/50">
              <Sparkles className="w-3 h-3" />
              {t('hero.eyebrow')}
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              {t('hero.title')}
              <span className="block text-primary mt-2">{t('hero.subtitle')}</span>
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              {t('hero.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/try"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                {t('hero.cta')}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
              >
                {t('hero.ctaTertiary')}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground mt-4">{t('hero.ctaSecondary')}</p>
          </div>
        </div>
      </section>

      {/* TRUST BAR — ecosystem reveal */}
      <section className="bg-muted/30 border-b border-border/40">
        <div className="container mx-auto px-6 py-10">
          <div className="text-center mb-6">
            <p className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
              {t('trustBar.title')}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">{t('trustBar.subtitle')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
            {TRUST_KEYS.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-2 text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 text-primary/70" aria-hidden />
                {t(`trustBar.items.${key}`)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PAINS — neckbleeding pain → fix pairs */}
      <section className="py-20 lg:py-24">
        <div className="container mx-auto px-6">
          <header className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold mb-3">{t('pains.title')}</h2>
            <p className="text-lg text-muted-foreground">{t('pains.subtitle')}</p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {PAIN_KEYS.map((key) => (
              <article
                key={key}
                className="rounded-lg border border-border/60 bg-card p-6 hover:border-primary/40 transition-colors"
              >
                <p className="text-sm font-mono uppercase tracking-wider text-destructive/80 mb-2">
                  Pain
                </p>
                <p className="text-base font-medium mb-4">
                  {t(`pains.items.${key}.pain`)}
                </p>
                <p className="text-sm font-mono uppercase tracking-wider text-primary/80 mb-2">
                  Fix
                </p>
                <p className="text-base text-muted-foreground">
                  {t(`pains.items.${key}.fix`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* STATS — what we ACTUALLY measure */}
      <section className="py-16 bg-muted/20 border-y border-border/40">
        <div className="container mx-auto px-6">
          <header className="max-w-3xl mx-auto text-center mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold mb-3">{t('stats.title')}</h2>
            <p className="text-muted-foreground">{t('stats.subtitle')}</p>
          </header>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-6">
            {STATS_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-lg border border-border/60 bg-card p-5"
              >
                <div className="flex items-center gap-2 text-primary mb-2">
                  {STATS_ICONS[key]}
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {t(`stats.items.${key}.label`)}
                  </span>
                </div>
                <div className="text-3xl font-bold tabular-nums mb-2">
                  {t(`stats.items.${key}.value`)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`stats.items.${key}.context`)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground/70 italic max-w-2xl mx-auto">
            {t('stats.honestyNote')}
          </p>
        </div>
      </section>

      {/* PERSONAS — 4 audience cards, fabricator first (highest LTV) */}
      <section className="py-20 lg:py-24">
        <div className="container mx-auto px-6">
          <header className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold mb-3">
              {t('personas.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('personas.subtitle')}
            </p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
            {PERSONA_KEYS.map((key) => (
              <article
                key={key}
                className="rounded-lg border border-border/60 bg-card p-6 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="rounded-md bg-primary/10 p-3 text-primary">
                    {PERSONA_ICONS[key]}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">
                      {t(`personas.${key}.title`)}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(`personas.${key}.tagline`)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {t(`personas.${key}.description`)}
                </p>
                <ul className="space-y-2 mb-5 text-sm">
                  {([0, 1, 2, 3, 4] as const).map((i) => {
                    const fix = t(`personas.${key}.fixes.${i}`);
                    if (!fix || fix === `personas.${key}.fixes.${i}`) return null;
                    return (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{fix}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={PERSONA_HREF[key]}
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  {t(`personas.${key}.cta`)}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* LINK-TO-QUOTE INTERACTIVE DEMO */}
      <section className="py-20 lg:py-24 bg-muted/20 border-y border-border/40">
        <div className="container mx-auto px-6">
          <header className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-3">
              {t('linkQuote.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('linkQuote.description')}
            </p>
          </header>
          <Suspense
            fallback={<div className="h-96 bg-muted/40 animate-pulse rounded-lg" />}
          >
            <LinkQuoteDemo />
          </Suspense>
        </div>
      </section>

      {/* FEATURES — 9 capability cards */}
      <section className="py-20 lg:py-24">
        <div className="container mx-auto px-6">
          <header className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold mb-3">
              {t('features.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('features.subtitle')}
            </p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {FEATURE_KEYS.map((key) => (
              <article
                key={key}
                className="rounded-lg border border-border/60 bg-card p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    {FEATURE_ICONS[key]}
                  </div>
                  <h3 className="font-semibold">{t(`features.${key}.title`)}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(`features.${key}.description`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-20 lg:py-24 bg-muted/20 border-y border-border/40">
        <div className="container mx-auto px-6">
          <PricingTiers />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 lg:py-24">
        <div className="container mx-auto px-6 text-center max-w-3xl">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            {t('cta.ready')}
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            {t('cta.description')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              {t('cta.startTrial')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/try"
              className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
            >
              {t('cta.continueGuest')}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('cta.noCreditCard')} • {t('cta.unlimitedQuotes')} • {t('cta.cancelAnytime')}
          </p>
        </div>
      </section>

      {/* FOOTER strap */}
      <section className="py-10 bg-muted/40 border-t border-border/40">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm font-medium mb-1">{t('footer.tagline')}</p>
          <p className="text-xs text-muted-foreground mb-1">
            {t('footer.ecosystem')}
          </p>
          <p className="text-xs text-muted-foreground/70 italic">
            {t('footer.joinCommunity')}
          </p>
        </div>
      </section>
    </div>
  );
}
