'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Plus,
  FileText,
  Clock,
  CheckCircle,
  DollarSign,
  ArrowRight,
  Eye,
  Loader2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { QuoteStatus, Currency } from '@cotiza/shared';
import { PriceDisplay } from '@/components/pricing/PriceDisplay';
import { useCurrency } from '@/hooks/useCurrency';
import { useTranslation } from '@/hooks/useTranslation';

interface DashboardQuote {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  currency: Currency;
  total: number;
  createdAt: string;
}

interface DashboardStats {
  totalQuotes: number;
  pendingQuotes: number;
  acceptedQuotes: number;
  totalRevenue: number;
  revenueCurrency: Currency;
}

const STATUS_VARIANT_MAP: Record<QuoteStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
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

function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-4 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentQuotesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { currency: userCurrency, format: formatCurrency } = useCurrency();
  const { t, formatDate } = useTranslation('quotes');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentQuotes, setRecentQuotes] = useState<DashboardQuote[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(true);

  const loadDashboardData = useCallback(async () => {
    // Load stats
    setLoadingStats(true);
    try {
      const statsData = await apiClient.get<DashboardStats>('/quotes/stats');
      setStats(statsData);
    } catch {
      // If stats endpoint doesn't exist, compute from quotes list
      try {
        const quotesData = await apiClient.get<{ data: DashboardQuote[] } | DashboardQuote[]>('/quotes?limit=100');
        const allQuotes = Array.isArray(quotesData) ? quotesData : quotesData.data || [];
        const pendingStatuses = new Set([
          QuoteStatus.DRAFT,
          QuoteStatus.SUBMITTED,
          QuoteStatus.AUTO_QUOTED,
          QuoteStatus.NEEDS_REVIEW,
          QuoteStatus.QUOTED,
        ]);
        const acceptedStatuses = new Set([
          QuoteStatus.APPROVED,
          QuoteStatus.ORDERED,
          QuoteStatus.IN_PRODUCTION,
          QuoteStatus.QC,
          QuoteStatus.SHIPPED,
          QuoteStatus.CLOSED,
        ]);

        const pending = allQuotes.filter((q) => pendingStatuses.has(q.status));
        const accepted = allQuotes.filter((q) => acceptedStatuses.has(q.status));
        const totalRevenue = accepted.reduce((sum, q) => sum + (q.total || 0), 0);

        setStats({
          totalQuotes: allQuotes.length,
          pendingQuotes: pending.length,
          acceptedQuotes: accepted.length,
          totalRevenue,
          revenueCurrency: userCurrency,
        });
      } catch {
        setStats({
          totalQuotes: 0,
          pendingQuotes: 0,
          acceptedQuotes: 0,
          totalRevenue: 0,
          revenueCurrency: userCurrency,
        });
      }
    } finally {
      setLoadingStats(false);
    }

    // Load recent quotes
    setLoadingQuotes(true);
    try {
      const quotesData = await apiClient.get<{ data: DashboardQuote[] } | DashboardQuote[]>('/quotes?limit=5&sort=createdAt:desc');
      const quotes = Array.isArray(quotesData) ? quotesData : quotesData.data || [];
      setRecentQuotes(quotes.slice(0, 5));
    } catch {
      setRecentQuotes([]);
    } finally {
      setLoadingQuotes(false);
    }
  }, [userCurrency]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session) {
      router.push('/auth/login');
      return;
    }
    loadDashboardData();
  }, [session, authStatus, loadDashboardData, router]);

  if (authStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!session) return null;

  const userName = session.user?.name || session.user?.email || '';

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('dashboard.welcome', { name: userName })}
          </p>
        </header>

        {/* KPI Cards */}
        {loadingStats ? (
          <KPISkeleton />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('dashboard.kpi.totalQuotes')}
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalQuotes ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('dashboard.kpi.pendingQuotes')}
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingQuotes ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('dashboard.kpi.acceptedQuotes')}
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.acceptedQuotes ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('dashboard.kpi.totalRevenue')}
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats
                    ? formatCurrency(stats.totalRevenue, stats.revenueCurrency)
                    : formatCurrency(0, userCurrency)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Quotes + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Quotes */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{t('dashboard.recentQuotes')}</CardTitle>
                  <Link href="/quotes">
                    <Button variant="ghost" size="sm">
                      {t('dashboard.viewAll')}
                      <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loadingQuotes ? (
                  <RecentQuotesSkeleton />
                ) : recentQuotes.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText
                      className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50"
                      aria-hidden="true"
                    />
                    <p className="font-medium">{t('dashboard.noQuotes')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('dashboard.noQuotesDescription')}
                    </p>
                    <Link href="/quote/new">
                      <Button className="mt-4">{t('dashboard.createQuote')}</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('history.columns.quoteNumber')}</TableHead>
                            <TableHead>{t('history.columns.date')}</TableHead>
                            <TableHead>{t('history.columns.status')}</TableHead>
                            <TableHead className="text-right">
                              {t('history.columns.total')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('history.columns.actions')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentQuotes.map((q) => (
                            <TableRow key={q.id}>
                              <TableCell className="font-medium">{q.quoteNumber}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(q.createdAt, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANT_MAP[q.status]}>
                                  {t(`status.${q.status}`)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <PriceDisplay
                                  amount={q.total}
                                  currency={q.currency}
                                  size="sm"
                                  variant="minimal"
                                  showConversion={false}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Link href={`/quote/${q.id}`}>
                                  <Button variant="ghost" size="sm">
                                    <Eye className="w-4 h-4" aria-hidden="true" />
                                    <span className="sr-only">{t('history.viewDetails')}</span>
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-3">
                      {recentQuotes.map((q) => (
                        <Link href={`/quote/${q.id}`} key={q.id} className="block">
                          <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{q.quoteNumber}</span>
                              <Badge variant={STATUS_VARIANT_MAP[q.status]} className="text-xs">
                                {t(`status.${q.status}`)}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span>
                                {formatDate(q.createdAt, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <PriceDisplay
                                amount={q.total}
                                currency={q.currency}
                                size="sm"
                                variant="minimal"
                                showConversion={false}
                              />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions Sidebar */}
          <aside>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('dashboard.newQuote')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/quote/new" className="block">
                  <Button className="w-full" size="lg">
                    <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
                    {t('dashboard.newQuote')}
                  </Button>
                </Link>
                <Link href="/quotes" className="block">
                  <Button variant="outline" className="w-full">
                    <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
                    {t('dashboard.viewAll')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
