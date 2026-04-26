'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '../error-boundary';
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  showBackButton?: boolean;
  customFallback?: React.ComponentType<{ error: Error; reset: () => void }>;
}

const DefaultRouteErrorFallback: React.FC<{
  error: Error;
  reset: () => void;
  showBackButton?: boolean;
}> = ({ error, reset, showBackButton = true }) => {
  const router = useRouter();

  const is404Error = error.message.includes('404') || error.message.includes('Not Found');
  const is403Error = error.message.includes('403') || error.message.includes('Forbidden');
  const is500Error = error.message.includes('500') || error.message.includes('Internal Server');

  const getErrorMessage = () => {
    if (is404Error)
      return { title: 'Page Not Found', description: "The page you're looking for doesn't exist." };
    if (is403Error)
      return {
        title: 'Access Denied',
        description: "You don't have permission to access this page.",
      };
    if (is500Error)
      return {
        title: 'Server Error',
        description: 'Something went wrong on our end. Please try again later.',
      };
    return {
      title: 'Something went wrong',
      description: 'An unexpected error occurred while loading this page.',
    };
  };

  const { title, description } = getErrorMessage();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-600">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={reset} className="flex-1">
              Try Again
            </Button>

            {showBackButton && (
              <Button onClick={() => router.back()} variant="outline" className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            )}
          </div>

          <Button onClick={() => router.push('/')} variant="ghost" className="w-full">
            <Home className="w-4 h-4 mr-2" />
            Return to Home
          </Button>

          {process.env.NODE_ENV === 'development' && (
            <details className="bg-gray-100 p-3 rounded text-sm">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">{error.stack}</pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const RouteErrorBoundary: React.FC<RouteErrorBoundaryProps> = ({
  children,
  showBackButton = true,
  customFallback: CustomFallback,
}) => {
  return (
    <ErrorBoundary
      fallback={
        CustomFallback ? (
          <CustomFallback error={new Error('Route error')} reset={() => window.location.reload()} />
        ) : (
          <DefaultRouteErrorFallback
            error={new Error('Route error')}
            reset={() => window.location.reload()}
            showBackButton={showBackButton}
          />
        )
      }
      onError={(error, errorInfo) => {
        console.error('Route Error Boundary:', error, errorInfo);

        // Report route errors to monitoring
        if (typeof window !== 'undefined' && window.Sentry) {
          window.Sentry.captureException(error, {
            tags: {
              errorBoundary: 'route',
              pathname: window.location.pathname,
            },
            contexts: {
              route: {
                pathname: window.location.pathname,
                search: window.location.search,
                hash: window.location.hash,
                errorInfo: errorInfo.componentStack,
              },
            },
          });
        }
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
