'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileUploadZone } from '@/components/quote/FileUploadZone';
import { QuoteItemsList } from '@/components/quote/QuoteItemsList';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AuthModal } from '@/components/auth/AuthModal';
import { useGuestSession } from '@/hooks/useGuestSession';
import { guestApi } from '@/lib/guest-api';
import { GuestQuote } from '@cotiza/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function GuestQuoteFlow() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, incrementQuoteCount } = useGuestSession();
  
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [quote, setQuote] = useState<GuestQuote | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState<'export' | 'share' | 'save'>('export');

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
  };

  const handleCreateQuote = async () => {
    if (files.length === 0) {
      toast.error(t('quote.errors.no_files'));
      return;
    }

    setIsUploading(true);
    try {
      // Upload files
      const uploadResult = await guestApi.uploadFiles(files);
      
      // Create quote
      const newQuote = await guestApi.createQuote({
        uploadId: uploadResult.uploadId,
        files: uploadResult.files,
      });

      setQuote(newQuote);
      incrementQuoteCount();
      toast.success(t('quote.success.created'));
    } catch (error) {
      console.error('Failed to create quote:', error);
      toast.error(t('quote.errors.creation_failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateItem = async (itemIndex: number, updates: Record<string, unknown>) => {
    if (!quote) return;

    try {
      const updatedQuote = await guestApi.updateQuoteItem(
        quote.id,
        itemIndex,
        updates
      );
      setQuote(updatedQuote);
      toast.success(t('quote.success.updated'));
    } catch (error) {
      console.error('Failed to update item:', error);
      toast.error(t('quote.errors.update_failed'));
    }
  };

  const handleAction = (action: 'export' | 'share' | 'save') => {
    setAuthAction(action);
    setShowAuthModal(true);
  };

  const handleAuthSuccess = async (_user: unknown, _tokens: unknown) => {
    // Convert the guest quote to authenticated quote
    if (session && quote) {
      try {
        const result = await guestApi.convertQuote({
          sessionId: session.id,
          sessionQuoteId: quote.id,
        }) as { quoteId: string; success: boolean };

        // Redirect to the converted quote
        router.push(`/quote/${result.quoteId}`);
        toast.success(t('auth.success.quote_saved'));
      } catch (error) {
        console.error('Failed to convert quote:', error);
        toast.error(t('auth.errors.conversion_failed'));
      }
    }
  };

  if (!quote) {
    return (
      <Card className="p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">
            {t('guest.title')}
          </h2>
          <p className="text-muted-foreground mb-8">
            {t('guest.description')}
          </p>

          <FileUploadZone
            onFilesSelected={handleFilesSelected}
            maxFiles={5}
            acceptedFileTypes={['.stl', '.step', '.stp', '.iges', '.igs', '.dxf']}
          />

          {files.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="text-sm text-muted-foreground">
                {t('quote.selected_files', { count: files.length })}
              </div>
              
              <Button
                onClick={handleCreateQuote}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <LoadingSpinner className="mr-2" />
                    {t('quote.creating')}
                  </>
                ) : (
                  t('quote.create_quote')
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {t('quote.your_quote')}
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleAction('share')}
            >
              {t('quote.actions.share')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAction('export')}
            >
              {t('quote.actions.export')}
            </Button>
            <Button
              onClick={() => handleAction('save')}
            >
              {t('quote.actions.save')}
            </Button>
          </div>
        </div>

        <QuoteItemsList
          items={quote.items}
          currency={quote.currency}
          onUpdateItem={handleUpdateItem}
          isEditable={true}
        />

        <div className="mt-6 pt-6 border-t">
          <div className="flex justify-between text-lg">
            <span>{t('quote.subtotal')}</span>
            <span className="font-semibold">
              {new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: quote.currency,
              }).format(quote.subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-lg">
            <span>{t('quote.tax')}</span>
            <span className="font-semibold">
              {new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: quote.currency,
              }).format(quote.tax)}
            </span>
          </div>
          <div className="flex justify-between text-xl font-bold mt-2 pt-2 border-t">
            <span>{t('quote.total')}</span>
            <span>
              {new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: quote.currency,
              }).format(quote.total)}
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800">
          {t('guest.save_reminder')}
        </p>
      </Card>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        mode="guest-conversion"
        guestQuoteId={quote.id}
        actionIntent={authAction}
      />
    </div>
  );
}