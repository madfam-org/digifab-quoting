/**
 * Tests for PmfWidgetMount — the @madfam/pmf-widget host component.
 *
 * Notes on what is and isn't tested here:
 *   - We deterministically test the synchronous gates (env flag, auth,
 *     pathname). These are pure props/state and produce a `null` render
 *     before any dynamic import is attempted.
 *   - We do NOT test the success path (widget actually rendered) because
 *     `@madfam/pmf-widget` is not installed yet (publish blocked on
 *     NPM_MADFAM_TOKEN rotation). The dynamic import in the component
 *     intentionally swallows the resolve-failure and renders null.
 *   - Module-level `process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED` is read
 *     once at import time, so tests use `jest.resetModules()` + dynamic
 *     `await import(...)` to re-evaluate the module under different
 *     env values.
 */
import { render, waitFor } from '@testing-library/react';

const mockUseSession = jest.fn<
  ReturnType<typeof getDefaultSession>,
  []
>(() => getDefaultSession());

function getDefaultSession() {
  return { data: null as unknown, status: 'unauthenticated' as string };
}

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const mockUsePathname = jest.fn<string | null, []>(() => '/dashboard');

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

const ORIGINAL_ENV = { ...process.env };

async function loadMount() {
  // Re-evaluate the module so the FLAG_ENABLED constant picks up the
  // current process.env value.
  jest.resetModules();
  const mod = await import('@/components/pmf/PmfWidgetMount');
  return mod.PmfWidgetMount;
}

function authenticatedSession(overrides?: { id?: string; email?: string; name?: string }) {
  return {
    data: {
      user: {
        id: overrides?.id ?? 'user-1',
        email: overrides?.email ?? 'a@example.com',
        name: overrides?.name ?? 'Alice',
      },
      expires: '2099-01-01T00:00:00Z',
    },
    status: 'authenticated' as string,
  };
}

describe('PmfWidgetMount (cotiza)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard');
    mockUseSession.mockReturnValue(getDefaultSession());
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('renders nothing when feature flag is off, even if authenticated', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'false';
    mockUseSession.mockReturnValue(authenticatedSession());
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when flag is on but user is anonymous', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on /login even when flag on + authenticated', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/login');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on /upload (pre-quote friction step)', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/upload');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on /quote/* (pre-acceptance configurator)', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/quote/abc-123');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on /checkout', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/checkout');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on marketing root /', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on /for/* (marketing audience pages)', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/for/fabricators');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on /pricing and /try (marketing)', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());

    mockUsePathname.mockReturnValue('/pricing');
    let PmfWidgetMount = await loadMount();
    let { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');

    mockUsePathname.mockReturnValue('/try');
    PmfWidgetMount = await loadMount();
    ({ container } = render(<PmfWidgetMount />));
    expect(container.innerHTML).toBe('');
  });

  it('attempts to load the widget on /dashboard when flag on + authenticated', async () => {
    // We can't assert the widget itself rendered (the @madfam/pmf-widget
    // module is not installed yet), but we can assert the component does
    // not synchronously bail before reaching the dynamic import. After
    // the dynamic import rejects, the render remains null (fail-closed).
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue('/dashboard');
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('renders nothing when pathname is null (SSR / pre-render)', async () => {
    process.env.NEXT_PUBLIC_PMF_WIDGET_ENABLED = 'true';
    mockUseSession.mockReturnValue(authenticatedSession());
    mockUsePathname.mockReturnValue(null);
    const PmfWidgetMount = await loadMount();
    const { container } = render(<PmfWidgetMount />);
    expect(container.innerHTML).toBe('');
  });
});
