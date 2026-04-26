'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showReloadButton?: boolean;
  showHomeButton?: boolean;
  showContactButton?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  isReloading: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      isReloading: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('Error Boundary caught an error:', error, errorInfo);

    // Report to monitoring service (e.g., Sentry)
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
        tags: {
          errorBoundary: true,
          errorId: this.state.errorId,
        },
      });
    }

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Show toast notification
    toast.error('Something went wrong', {
      description: 'An unexpected error occurred. Please try refreshing the page.',
      action: {
        label: 'Refresh',
        onClick: () => this.handleReload(),
      },
    });
  }

  handleReload = () => {
    this.setState({ isReloading: true });
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleContact = () => {
    // Open contact/support modal or redirect to support page
    window.open('mailto:support@cotiza.studio', '_blank');
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
      isReloading: false,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <CardTitle className="text-red-600">Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. This has been automatically reported to our team.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="bg-gray-100 p-3 rounded text-sm">
                  <summary className="cursor-pointer font-medium">Error Details</summary>
                  <pre className="mt-2 text-xs overflow-auto">{this.state.error.stack}</pre>
                </details>
              )}

              {this.state.errorId && (
                <p className="text-xs text-gray-500 text-center">Error ID: {this.state.errorId}</p>
              )}

              <div className="flex flex-col space-y-2">
                <Button onClick={this.handleRetry} className="w-full" variant="default">
                  Try Again
                </Button>

                {this.props.showReloadButton !== false && (
                  <Button
                    onClick={this.handleReload}
                    variant="outline"
                    className="w-full"
                    disabled={this.state.isReloading}
                  >
                    <RefreshCw
                      className={`w-4 h-4 mr-2 ${this.state.isReloading ? 'animate-spin' : ''}`}
                    />
                    {this.state.isReloading ? 'Reloading...' : 'Reload Page'}
                  </Button>
                )}

                {this.props.showHomeButton !== false && (
                  <Button onClick={this.handleGoHome} variant="outline" className="w-full">
                    <Home className="w-4 h-4 mr-2" />
                    Go Home
                  </Button>
                )}

                {this.props.showContactButton !== false && (
                  <Button onClick={this.handleContact} variant="ghost" className="w-full">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Contact Support
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC wrapper for easier use
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook for error boundaries in functional components
export function useErrorHandler() {
  return (error: Error, _errorInfo?: ErrorInfo) => {
    // Manually trigger error boundary
    throw error;
  };
}
