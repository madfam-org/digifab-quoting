'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const errorParam = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);

  const errorMessages: Record<string, string> = {
    Configuration: 'Authentication is not yet fully configured for this environment. Contact support.',
    AccessDenied: 'Access denied. Your account may not have permission to use this application.',
    Verification: 'The sign-in link is invalid or has expired. Please try again.',
    OAuthSignin: 'Could not start the sign-in flow. Please try again.',
    OAuthCallback: 'Authentication callback failed. Please try again.',
    OAuthCreateAccount: 'Could not create an account. Please contact support.',
    EmailCreateAccount: 'Could not create an account from this email. Please try again.',
    OAuthAccountNotLinked: 'This email is already associated with another account.',
    EmailSignin: 'The email sign-in link could not be sent. Please try again.',
    CredentialsSignin: 'Invalid sign-in credentials. Please try again.',
    SessionRequired: 'Please sign in to access this page.',
    Callback: 'An error occurred during authentication.',
    Default: 'An unexpected error occurred. Please try again.',
  };

  const displayError = errorParam
    ? errorMessages[errorParam] || errorMessages.Default
    : null;

  const handleSignIn = async () => {
    setIsLoading(true);
    // Redirect to Janua OIDC authorization endpoint via NextAuth
    await signIn('janua', { callbackUrl });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign in to Cotiza Studio
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Authenticate securely via your MADFAM account
          </p>
        </div>

        {displayError && (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}

        <div className="mt-8 space-y-4">
          <Button
            onClick={handleSignIn}
            disabled={isLoading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4 mr-2" />
            )}
            Sign in with Janua
          </Button>

          <p className="text-xs text-center text-gray-500">
            Janua is MADFAM&apos;s secure identity platform.
            Your credentials are never shared with this application.
          </p>
        </div>
      </div>
    </div>
  );
}
