'use client';

/**
 * PmfWidgetMount — scaffolded integration for `@madfam/pmf-widget`.
 *
 * SCAFFOLD STATUS (read before "fixing" the dynamic import):
 *
 * `@madfam/pmf-widget@0.1.0` is built but NOT YET PUBLISHED to the
 * MADFAM npm registry. Publish is blocked on `NPM_MADFAM_TOKEN`
 * rotation (operator-only). The package is declared in
 * apps/web/package.json so lockfile resolution lands the moment the
 * publish unblocks, but `npm ci` in CI today resolves it as a missing
 * optional-ish dep.
 *
 * To keep CI green BEFORE the publish:
 *   1. The import is dynamic (runtime), not static — webpack/turbopack
 *      do not resolve it at build time, so a missing module does not
 *      fail the build.
 *   2. The component is gated on `NEXT_PUBLIC_PMF_WIDGET_ENABLED`. Until
 *      an operator flips the flag, the dynamic import never fires and
 *      no runtime resolution is attempted.
 *   3. A local type stub at `apps/web/src/types/madfam-pmf-widget.d.ts`
 *      satisfies `tsc --noEmit` so typecheck passes without the package
 *      installed. Delete the stub after the real package is installed
 *      so the published types take over.
 *
 * Activation checklist (post-publish):
 *   - Operator runs `npm install @madfam/pmf-widget@^0.1.0` in apps/web
 *   - Set `NEXT_PUBLIC_PMF_WIDGET_ENABLED=true` in the deployed env
 *   - Set `NEXT_PUBLIC_TULANA_API_URL` if not the default
 *   - Delete `apps/web/src/types/madfam-pmf-widget.d.ts`
 *
 * See RFC 0013 (internal-devops/rfcs/0013-pmf-via-coforma-and-tulana.md)
 * for the full PMF measurement architecture. Reference implementation:
 * tezca PR #39 (apps/web/components/pmf/PmfWidgetMount.tsx).
 */

import { useEffect, useState, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const FLAG_ENABLED = process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED === 'true';
const TULANA_API_URL =
  process.env.NEXT_PUBLIC_TULANA_API_URL || 'https://api.tulana.madfam.io';

/**
 * Route prefixes where the PMF widget MUST NOT render. PMF signal is
 * only meaningful on the post-quote-acceptance product surface; rendering
 * on auth pages, the upload flow, the marketing landing, or the
 * pre-acceptance quote configurator would either (a) distort the signal
 * (first-session noise / pre-conversion friction) or (b) conflict with
 * checkout flows.
 *
 * Marketing/public pages (`/`, `/for/*`, `/pricing`, `/features`, `/try`)
 * are explicitly excluded. The `session.status === 'authenticated'` gate
 * below ensures anonymous traffic never sees the widget regardless of
 * pathname, but excluding marketing prefixes is belt-and-suspenders since
 * an authenticated user can still browse marketing.
 */
const EXCLUDED_PATH_PREFIXES = [
  '/login',     // Janua sign-in / sign-up flow
  '/auth',      // NextAuth callback + auth utility pages
  '/upload',    // File upload step (pre-quote, friction-heavy)
  '/quote',     // Quote configuration (pre-acceptance) and detail
  '/checkout',  // Stripe checkout flow
  '/for',       // Marketing audience pages (/for/fabricators, etc.)
  '/pricing',   // Marketing pricing page
  '/features',  // Marketing features page
  '/try',       // DIY landing
];

// Marketing root `/` is excluded as an exact match (not prefix) so we
// don't accidentally exclude every authenticated route under it.
const EXCLUDED_EXACT_PATHS = new Set<string>(['/']);

function isExcludedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (EXCLUDED_EXACT_PATHS.has(pathname)) return true;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Minimal structural type matching @madfam/pmf-widget's PMFWidgetProps.
// Kept narrow so we only depend on the props we actually pass; the real
// types take over once the package is installed.
interface PmfWidgetComponentProps {
  product: string;
  user: { id: string; email?: string; name?: string; plan?: string };
  apiUrl: string;
  triggers: {
    nps?: { afterSession?: number; dismissCooldownDays?: number };
    ellis?: { afterSession?: number; dismissCooldownDays?: number };
    smile?: { afterAction?: { type: string; count: number } };
  };
  productLabel?: string;
  disabled?: boolean;
}

type PmfWidgetModule = {
  PMFWidget: ComponentType<PmfWidgetComponentProps>;
};

export function PmfWidgetMount() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [Widget, setWidget] = useState<ComponentType<PmfWidgetComponentProps> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const pathExcluded = isExcludedPath(pathname);
  const isAuthenticated = status === 'authenticated';
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const email = session?.user?.email ?? undefined;
  const name = session?.user?.name ?? undefined;

  useEffect(() => {
    if (!FLAG_ENABLED) return;
    if (pathExcluded) return;
    if (!isAuthenticated || !userId) return;

    let cancelled = false;
    // Dynamic import keeps the build green when the package is not yet
    // installed. Webpack/Turbopack treat the string as a runtime value,
    // so it is not resolved at compile time.
    const modulePath = '@madfam/pmf-widget';
    import(/* webpackIgnore: true */ /* @vite-ignore */ modulePath)
      .then((mod: PmfWidgetModule) => {
        if (cancelled) return;
        setWidget(() => mod.PMFWidget);
      })
      .catch(() => {
        if (cancelled) return;
        // Package not installed yet (pre-publish) or transient runtime
        // resolve failure. Fail closed — never break the page on a
        // telemetry widget.
        setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId, pathExcluded]);

  if (!FLAG_ENABLED) return null;
  if (pathExcluded) return null;
  if (loadFailed) return null;
  if (!Widget) return null;
  if (!isAuthenticated || !userId) return null;

  return (
    <Widget
      product="cotiza"
      user={{
        id: userId,
        email,
        name,
      }}
      apiUrl={TULANA_API_URL}
      productLabel="Cotiza"
      triggers={{
        nps: { afterSession: 4, dismissCooldownDays: 30 },
        ellis: { afterSession: 2, dismissCooldownDays: 45 },
        smile: { afterAction: { type: 'quote_accepted', count: 1 } },
      }}
    />
  );
}
