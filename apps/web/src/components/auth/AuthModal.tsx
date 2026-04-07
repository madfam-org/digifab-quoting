'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: unknown, tokens: unknown) => void;
  mode?: 'login' | 'register' | 'guest-conversion';
  redirectTo?: string;
  guestQuoteId?: string;
  actionIntent?: 'export' | 'share' | 'save';
}

export function AuthModal({
  isOpen,
  onClose,
  mode = 'login',
  redirectTo = '/dashboard',
  actionIntent,
}: AuthModalProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    // Redirect to Janua OIDC via NextAuth -- the browser will navigate away
    await signIn('janua', { callbackUrl: redirectTo });
  };

  const getDialogContent = () => {
    if (mode === 'guest-conversion') {
      const actionMessages = {
        export: t('auth.guest.export_message'),
        share: t('auth.guest.share_message'),
        save: t('auth.guest.save_message'),
      };

      return {
        title: t('auth.guest.title'),
        description: actionMessages[actionIntent || 'save'],
      };
    }

    return {
      title: t('auth.title'),
      description: t('auth.description'),
    };
  };

  const { title, description } = getDialogContent();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === 'guest-conversion' && (
          <Alert className="mt-4">
            <AlertDescription>
              {t('auth.guest.benefits')}
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-6 space-y-4">
          <Button
            onClick={handleSignIn}
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <LoadingSpinner className="mr-2" />
                {t('auth.logging_in')}
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {t('auth.login_button') || 'Sign in with Janua'}
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            {t('auth.janua_note') ||
              'You will be redirected to Janua, MADFAM\'s secure identity platform.'}
          </p>
        </div>

        {mode === 'guest-conversion' && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            {t('auth.guest.privacy_note')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}