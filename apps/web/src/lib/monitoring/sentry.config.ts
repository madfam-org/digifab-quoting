import * as Sentry from '@sentry/nextjs';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

export function initializeSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment configuration
    environment: process.env.NODE_ENV || 'development',

    // Performance monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in dev

    // Session replay
    replaysSessionSampleRate: isProduction ? 0.01 : 0.1, // 1% in prod, 10% in dev
    replaysOnErrorSampleRate: 1.0, // Always capture replays on errors

    // Trace propagation targets (moved to global level in v8)
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/api\.madfam\.com/,
      /^https:\/\/.*\.madfam\.com/,
    ],

    // Error filtering
    beforeSend(event, _hint) {
      // Filter out development-only errors
      if (isDevelopment) {
        // Skip HMR errors
        if (event.message?.includes('HMR') || event.message?.includes('hot reload')) {
          return null;
        }

        // Skip webpack errors
        if (event.exception?.values?.[0]?.value?.includes('webpack')) {
          return null;
        }
      }

      // Filter out common browser extension errors
      if (event.exception?.values?.[0]?.value?.includes('chrome-extension://')) {
        return null;
      }

      // Filter out network errors that are not actionable
      if (
        event.message?.includes('Loading chunk') ||
        event.message?.includes('Loading CSS chunk')
      ) {
        return null;
      }

      return event;
    },

    // Integration configuration
    integrations: [
      Sentry.browserTracingIntegration(),

      Sentry.replayIntegration({
        // Privacy settings
        maskAllText: isProduction,
        blockAllMedia: isProduction,
        maskAllInputs: true,

        // Network settings
        networkDetailAllowUrls: [/^https:\/\/api\.madfam\.com/],
      }),
    ],

    // Additional configuration
    release: process.env.NEXT_PUBLIC_APP_VERSION,
    initialScope: {
      tags: {
        component: 'frontend',
        platform: 'web',
      },
    },

    // Debug settings
    debug: isDevelopment,

    // Ignore specific errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'http://tt.epicplay.com',
      "Can't find variable: ZiteReader",
      'jigsaw is not defined',
      'ComboSearch is not defined',
      'http://loading.retry.widdit.com/',
      'atomicFindClose',
      'fb_xd_fragment',
      'bmi_SafeAddOnload',
      'EBCallBackMessageReceived',
      'conduitPage',

      // Network errors
      'Network request failed',
      'NetworkError when attempting to fetch resource',
      'The network connection was lost',
      'Load failed',

      // ResizeObserver errors (common but harmless)
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',

      // AbortError (user navigated away)
      'AbortError: The operation was aborted',
      'AbortError: Fetch is aborted',

      // Non-Error objects
      /Non-Error promise rejection captured/i,
    ],

    // Breadcrumb filtering
    beforeBreadcrumb(breadcrumb, _hint) {
      // Filter out noisy console logs in production
      if (isProduction && breadcrumb.category === 'console') {
        return null;
      }

      // Filter out UI events that aren't useful
      if (breadcrumb.category === 'ui.input' && breadcrumb.message?.includes('password')) {
        breadcrumb.message = '[Filtered]';
      }

      return breadcrumb;
    },
  });
}

// Custom error reporting functions
export function reportError(error: Error, context?: Record<string, unknown>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('custom', context);
    }
    Sentry.captureException(error);
  });
}

export function reportMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>,
) {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    if (context) {
      scope.setContext('custom', context);
    }
    Sentry.captureMessage(message);
  });
}

export function setUserContext(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
}

export function addBreadcrumb(message: string, category?: string, level?: Sentry.SeverityLevel) {
  Sentry.addBreadcrumb({
    message,
    category: category || 'custom',
    level: level || 'info',
    timestamp: Date.now() / 1000,
  });
}

export function startTransaction(name: string, operation?: string) {
  return Sentry.startSpan(
    {
      name,
      op: operation || 'custom',
    },
    (span) => span,
  );
}

// Performance monitoring helpers
export function measureFunction<T extends (...args: unknown[]) => unknown>(
  fn: T,
  name: string,
  operation: string = 'function',
): T {
  return ((...args: unknown[]) => {
    return Sentry.startSpan({ name, op: operation }, () => {
      try {
        const result = fn(...args);

        // Handle promises
        if (result instanceof Promise) {
          return result.catch((error) => {
            Sentry.captureException(error);
            throw error;
          });
        }

        return result;
      } catch (error) {
        Sentry.captureException(error);
        throw error;
      }
    });
  }) as T;
}

// React error boundary integration
export function captureErrorBoundaryError(error: Error, componentStack: string) {
  Sentry.withScope((scope) => {
    scope.setTag('errorBoundary', true);
    scope.setContext('react', {
      componentStack,
    });
    Sentry.captureException(error);
  });
}

declare global {
  interface Window {
    Sentry: typeof Sentry;
  }
}

// Make Sentry available globally for error boundaries
if (typeof window !== 'undefined') {
  window.Sentry = Sentry;
}
