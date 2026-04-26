'use client';

import React from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from '../error-boundary';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface QueryErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
}

const DefaultQueryErrorFallback: React.FC<{ error: Error; reset: () => void }> = ({
  error,
  reset,
}) => {
  const isNetworkError = error.message.includes('Network Error') || error.message.includes('fetch');
  const isTimeoutError = error.message.includes('timeout');

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-orange-600" />
        </div>
        <CardTitle className="text-orange-600">
          {isNetworkError
            ? 'Connection Problem'
            : isTimeoutError
              ? 'Request Timeout'
              : 'Unable to Load Data'}
        </CardTitle>
        <CardDescription>
          {isNetworkError
            ? 'Please check your internet connection and try again.'
            : isTimeoutError
              ? 'The request took too long to complete. Please try again.'
              : 'There was an error loading the requested data.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Button onClick={reset} className="w-full">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 bg-gray-100 p-3 rounded text-sm">
            <summary className="cursor-pointer font-medium">Error Details</summary>
            <pre className="mt-2 text-xs overflow-auto">{error.message}</pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

export const QueryErrorBoundary: React.FC<QueryErrorBoundaryProps> = ({
  children,
  fallback: Fallback = DefaultQueryErrorFallback,
}) => {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallback={
            <div className="p-4">
              <Fallback error={new Error('Query failed')} reset={reset} />
            </div>
          }
          onError={(error, errorInfo) => {
            console.error('Query Error Boundary:', error, errorInfo);

            // Report query errors to monitoring
            if (typeof window !== 'undefined' && window.Sentry) {
              window.Sentry.captureException(error, {
                tags: {
                  errorBoundary: 'query',
                },
                contexts: {
                  query: {
                    errorInfo: errorInfo.componentStack,
                  },
                },
              });
            }
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};
