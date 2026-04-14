'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Search,
  FileText,
  Eye,
  Loader2,
} from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import { QuoteStatus, Currency } from '@cotiza/shared';
import { PriceDisplay } from '@/components/pricing/PriceDisplay';
import { useTranslation } from '@/hooks/useTranslation';

interface QuoteListItem {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  currency: Currency;
  total: number;
  itemCount: number;
  createdAt: string;
}

interface QuotesListResponse {
  data: QuoteListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type StatusFilter = 'all' | 'pending' | 'accepted' | 'expired';

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

const STATUS_FILTER_MAP: Record<StatusFilter, QuoteStatus[]> = {
  all: [],
  pending: [QuoteStatus.DRAFT, QuoteStatus.SUBMITTED, QuoteStatus.AUTO_QUOTED, QuoteStatus.NEEDS_REVIEW, QuoteStatus.QUOTED],
  accepted: [QuoteStatus.APPROVED, QuoteStatus.ORDERED, QuoteStatus.IN_PRODUCTION, QuoteStatus.QC, QuoteStatus.SHIPPED, QuoteStatus.CLOSED],
  expired: [QuoteStatus.EXPIRED, QuoteStatus.CANCELLED, QuoteStatus.REJECTED],
};

function QuotesListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-24 ml-auto" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function QuotesHistoryPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { toast } = useToast();
  const { t, formatDate } = useTranslation('quotes');

  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [totalQuotes, setTotalQuotes] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const LIMIT = 20;

  const buildQueryParams = useCallback(
    (pageNum: number): string => {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', String(LIMIT));

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const statuses = STATUS_FILTER_MAP[statusFilter];
      if (statuses.length > 0) {
        params.set('status', statuses.join(','));
      }

      return params.toString();
    },
    [searchQuery, statusFilter]
  );

  const loadQuotes = useCallback(
    async (pageNum: number, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      try {
        const queryString = buildQueryParams(pageNum);
        const response = await apiClient.get<QuotesListResponse>(`/quotes?${queryString}`);

        if (append) {
          setQuotes((prev) => [...prev, ...response.data]);
        } else {
          setQuotes(response.data);
        }

        setTotalQuotes(response.meta.total);
        setTotalPages(response.meta.totalPages);
        setPage(pageNum);
      } catch (error) {
        console.error('Error loading quotes:', error);
        // If the API returns a non-paginated array, handle gracefully
        if (error instanceof ApiError && error.status !== 401) {
          try {
            const fallback = await apiClient.get<QuoteListItem[]>('/quotes');
            if (Array.isArray(fallback)) {
              setQuotes(fallback);
              setTotalQuotes(fallback.length);
              setTotalPages(1);
            }
          } catch {
            toast({
              title: t('errors.loadListFailed'),
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: t('errors.loadListFailed'),
            variant: 'destructive',
          });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQueryParams, toast, t]
  );

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session) {
      router.push('/auth/login');
      return;
    }
    loadQuotes(1, false);
  }, [session, authStatus, loadQuotes]);

  // Reload on filter/search change
  useEffect(() => {
    if (!session || authStatus !== 'authenticated') return;
    const debounce = setTimeout(() => {
      loadQuotes(1, false);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, statusFilter, session, authStatus, loadQuotes]);

  const handleLoadMore = () => {
    if (page < totalPages) {
      loadQuotes(page + 1, true);
    }
  };

  // Client-side filtering as a fallback when the API does not support query params
  const filteredQuotes = quotes.filter((q) => {
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      if (!q.quoteNumber.toLowerCase().includes(query)) return false;
    }
    const statuses = STATUS_FILTER_MAP[statusFilter];
    if (statuses.length > 0 && !statuses.includes(q.status)) return false;
    return true;
  });

  if (authStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t('history.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('history.description')}</p>
          </div>
          <Link href="/quote/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              {t('dashboard.newQuote')}
            </Button>
          </Link>
        </header>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  placeholder={t('history.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  aria-label={t('history.searchPlaceholder')}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('history.filterAll')}</SelectItem>
                  <SelectItem value="pending">{t('history.filterPending')}</SelectItem>
                  <SelectItem value="accepted">{t('history.filterAccepted')}</SelectItem>
                  <SelectItem value="expired">{t('history.filterExpired')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('title')}</CardTitle>
              {!loading && totalQuotes > 0 && (
                <span className="text-sm text-muted-foreground">
                  {t('history.showing', {
                    count: String(filteredQuotes.length),
                    total: String(totalQuotes),
                  })}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <QuotesListSkeleton />
            ) : filteredQuotes.length === 0 ? (
              <div className="text-center py-16">
                <FileText
                  className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <h3 className="font-semibold text-lg mb-1">
                  {quotes.length === 0
                    ? t('history.noQuotes')
                    : t('history.noMatchingQuotes')}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {quotes.length === 0
                    ? t('history.noQuotesDescription')
                    : t('history.noMatchingQuotes')}
                </p>
                {quotes.length === 0 && (
                  <Link href="/quote/new">
                    <Button>{t('history.createFirst')}</Button>
                  </Link>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('history.columns.quoteNumber')}</TableHead>
                        <TableHead>{t('history.columns.date')}</TableHead>
                        <TableHead>{t('history.columns.status')}</TableHead>
                        <TableHead className="text-center">
                          {t('history.columns.items')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('history.columns.total')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('history.columns.actions')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQuotes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium">{q.quoteNumber}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(q.createdAt, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT_MAP[q.status]}>
                              {t(`status.${q.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{q.itemCount ?? '-'}</TableCell>
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
                                <Eye className="w-4 h-4 mr-1" aria-hidden="true" />
                                {t('history.viewDetails')}
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {filteredQuotes.map((q) => (
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
                              year: 'numeric',
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

                {/* Load More */}
                {page < totalPages && (
                  <div className="flex justify-center pt-6">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2
                            className="w-4 h-4 mr-2 animate-spin"
                            aria-hidden="true"
                          />
                          {t('history.loading')}
                        </>
                      ) : (
                        t('history.loadMore')
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
