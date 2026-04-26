'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Download,
  CreditCard,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  FileText,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import { QuoteStatus, Currency } from '@cotiza/shared';
import { PriceDisplay } from '@/components/pricing/PriceDisplay';
import { useCurrency } from '@/hooks/useCurrency';
import { useTranslation } from '@/hooks/useTranslation';

interface DFMIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  location?: string;
}

interface DFMReport {
  id: string;
  quoteItemId: string;
  riskScore: number;
  issues: DFMIssue[];
  metrics?: {
    volumeCm3: number;
    surfaceAreaCm2: number;
    bboxMm: { x: number; y: number; z: number };
  };
}

interface QuoteItem {
  id: string;
  partName: string;
  process: string;
  material: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  leadTime: number;
  dfmReport?: DFMReport;
}

interface QuoteCustomer {
  id: string;
  name: string;
  email: string;
  company?: string;
}

interface Quote {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  currency: Currency;
  subtotal: number;
  tax: number;
  shipping?: number;
  discount?: number;
  total: number;
  validUntil: string;
  createdAt: string;
  customer?: QuoteCustomer;
  items: QuoteItem[];
}

interface AcceptResponse {
  checkoutUrl?: string;
  orderId?: string;
}

const STATUS_VARIANT_MAP: Record<
  QuoteStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  draft: 'secondary',
  submitted: 'default',
  auto_quoted: 'default',
  needs_review: 'outline',
  quoted: 'default',
  approved: 'success',
  ordered: 'success',
  in_production: 'default',
  qc: 'default',
  shipped: 'success',
  closed: 'secondary',
  cancelled: 'destructive',
  rejected: 'destructive',
  expired: 'secondary',
};

const DFM_SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-red-100 text-red-800 border-red-200',
};

function QuoteDetailSkeleton() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-6 w-32 mb-8" />
        <div className="flex justify-between items-center mb-8">
          <div>
            <Skeleton className="h-9 w-56 mb-2" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-7 w-32" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-7 w-24" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { toast } = useToast();
  const { currency: userCurrency, format: formatCurrency } = useCurrency();
  const { t, formatDate } = useTranslation('quotes');

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);

  const loadQuote = useCallback(async () => {
    try {
      const quoteData = await apiClient.get<Quote>(`/quotes/${id}`);
      setQuote(quoteData);
    } catch (error) {
      console.error('Error loading quote:', error);
      toast({
        title: t('errors.loadFailed'),
        description: String(error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, router, toast, t]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session) {
      router.push('/auth/login');
      return;
    }
    loadQuote();
  }, [session, authStatus, loadQuote]);

  const handleAccept = async () => {
    setAccepting(true);
    setShowAcceptDialog(false);

    try {
      const response = await apiClient.post<AcceptResponse>(`/quotes/${id}/accept`);

      toast({
        title: t('accept.success'),
        description: t('accept.redirecting'),
      });

      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Error accepting quote:', error);
      toast({
        title: t('accept.error'),
        description: String(error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
      setAccepting(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const pdfData = await apiClient.get<{ url: string }>(`/quotes/${id}/pdf`);
      window.open(pdfData.url, '_blank');
    } catch (error) {
      toast({
        title: t('errors.pdfFailed'),
        description: String(error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
    }
  };

  const isExpired = quote?.validUntil ? new Date(quote.validUntil) < new Date() : false;
  const canAccept = quote?.status === 'quoted' && !isExpired;
  const hasDfmResults = quote?.items.some((item) => item.dfmReport);

  if (loading || authStatus === 'loading') {
    return <QuoteDetailSkeleton />;
  }

  if (!quote) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        {/* Back navigation */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href="/quotes"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
            {t('detail.backToQuotes')}
          </Link>
        </nav>

        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {t('detail.title', { number: quote.quoteNumber })}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('detail.createdOn', {
                date: formatDate(quote.createdAt, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
              })}
            </p>
            {quote.customer && (
              <p className="text-sm text-muted-foreground mt-1">
                {quote.customer.name}
                {quote.customer.company ? ` - ${quote.customer.company}` : ''}
              </p>
            )}
          </div>
          <Badge variant={STATUS_VARIANT_MAP[quote.status]} className="text-sm px-3 py-1">
            {t(`status.${quote.status}`)}
          </Badge>
        </header>

        {/* Expired warning */}
        {isExpired && quote.status === 'quoted' && (
          <Alert variant="destructive" className="mb-6">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{t('detail.expired')}</AlertTitle>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content: Items table + DFM */}
          <div className="lg:col-span-2 space-y-6">
            {/* Line Items Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  <FileText className="w-5 h-5 inline-block mr-2" aria-hidden="true" />
                  {t('detail.items')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('detail.items')}</TableHead>
                      <TableHead className="text-center">{t('detail.quantity')}</TableHead>
                      <TableHead className="text-right">{t('detail.unitPrice')}</TableHead>
                      <TableHead className="text-right">{t('pricing.subtotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quote.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.partName}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.process} &middot; {item.material}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('detail.leadTime', { days: String(item.leadTime) })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          <PriceDisplay
                            amount={item.unitPrice}
                            currency={quote.currency}
                            size="sm"
                            variant="minimal"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <PriceDisplay
                            amount={item.subtotal}
                            currency={quote.currency}
                            size="sm"
                            variant="minimal"
                            showConversion={false}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* DFM Results */}
            {hasDfmResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Info className="w-5 h-5 inline-block mr-2" aria-hidden="true" />
                    {t('dfm.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {quote.items
                    .filter((item) => item.dfmReport)
                    .map((item) => {
                      const report = item.dfmReport!;
                      const hasIssues = report.issues.length > 0;

                      return (
                        <div key={item.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{item.partName}</h4>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {t('dfm.riskScore')}:
                              </span>
                              <Badge
                                variant={
                                  report.riskScore <= 0.3
                                    ? 'success'
                                    : report.riskScore <= 0.6
                                      ? 'secondary'
                                      : 'destructive'
                                }
                              >
                                {Math.round(report.riskScore * 100)}%
                              </Badge>
                            </div>
                          </div>

                          {hasIssues ? (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">
                                {t('dfm.issues', { count: String(report.issues.length) })}
                              </p>
                              {report.issues.map((issue, idx) => (
                                <div
                                  key={idx}
                                  className={`flex items-start gap-3 rounded-md border p-3 ${DFM_SEVERITY_COLORS[issue.severity] || ''}`}
                                >
                                  {issue.severity === 'high' ? (
                                    <AlertTriangle
                                      className="w-4 h-4 mt-0.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                  ) : issue.severity === 'medium' ? (
                                    <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <CheckCircle2
                                      className="w-4 h-4 mt-0.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <div>
                                    <p className="text-sm font-medium">
                                      {issue.type}
                                      <span className="ml-2 text-xs font-normal">
                                        ({t(`dfm.severity.${issue.severity}`)})
                                      </span>
                                    </p>
                                    <p className="text-sm mt-0.5">{issue.description}</p>
                                    {issue.location && (
                                      <p className="text-xs mt-1 opacity-75">{issue.location}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-green-700">
                              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                              {t('dfm.noIssues')}
                            </div>
                          )}

                          {report.metrics && (
                            <div className="grid grid-cols-3 gap-4 pt-2 border-t text-sm text-muted-foreground">
                              <div>
                                <span className="block text-xs">Volume</span>
                                <span className="font-medium text-foreground">
                                  {report.metrics.volumeCm3.toFixed(2)} cm3
                                </span>
                              </div>
                              <div>
                                <span className="block text-xs">Surface</span>
                                <span className="font-medium text-foreground">
                                  {report.metrics.surfaceAreaCm2.toFixed(1)} cm2
                                </span>
                              </div>
                              <div>
                                <span className="block text-xs">Bounding Box</span>
                                <span className="font-medium text-foreground">
                                  {report.metrics.bboxMm.x.toFixed(0)} x{' '}
                                  {report.metrics.bboxMm.y.toFixed(0)} x{' '}
                                  {report.metrics.bboxMm.z.toFixed(0)} mm
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar: pricing + actions */}
          <aside className="space-y-6">
            {/* Pricing Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('detail.summary')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.subtotal')}</span>
                    <span className="font-mono">
                      {formatCurrency(quote.subtotal, quote.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('pricing.tax')}</span>
                    <span className="font-mono">{formatCurrency(quote.tax, quote.currency)}</span>
                  </div>
                  {quote.shipping != null && quote.shipping > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('pricing.shipping')}</span>
                      <span className="font-mono">
                        {formatCurrency(quote.shipping, quote.currency)}
                      </span>
                    </div>
                  )}
                  {quote.discount != null && quote.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{t('pricing.discount')}</span>
                      <span className="font-mono">
                        -{formatCurrency(quote.discount, quote.currency)}
                      </span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between items-center pt-1">
                  <span className="font-semibold">{t('pricing.total')}</span>
                  <PriceDisplay
                    amount={quote.total}
                    currency={quote.currency}
                    size="lg"
                    variant="minimal"
                    showConversion={quote.currency !== userCurrency}
                  />
                </div>

                {quote.currency !== userCurrency && (
                  <div className="text-xs text-muted-foreground text-right">
                    ~ {formatCurrency(quote.total, userCurrency)}
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  {t('detail.validUntil', {
                    date: formatDate(quote.validUntil, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }),
                  })}
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  {canAccept && (
                    <Button
                      onClick={() => setShowAcceptDialog(true)}
                      disabled={accepting}
                      className="w-full"
                      size="lg"
                    >
                      {accepting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                          {t('detail.processing')}
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" aria-hidden="true" />
                          {t('detail.acceptQuote')}
                        </>
                      )}
                    </Button>
                  )}

                  <Button variant="outline" onClick={handleDownloadPdf} className="w-full">
                    <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                    {t('detail.downloadPdf')}
                  </Button>

                  <Link href="/dashboard" className="block">
                    <Button variant="ghost" className="w-full">
                      {t('detail.backToDashboard')}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* Accept Confirmation Dialog */}
      <Dialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accept.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('accept.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
              <span className="font-medium">{t('pricing.total')}</span>
              <PriceDisplay
                amount={quote.total}
                currency={quote.currency}
                size="lg"
                variant="minimal"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAcceptDialog(false)}>
              {t('accept.cancel')}
            </Button>
            <Button onClick={handleAccept} disabled={accepting}>
              {accepting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  {t('detail.processing')}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('accept.confirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
