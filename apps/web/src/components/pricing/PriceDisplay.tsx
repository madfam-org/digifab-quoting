'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { CurrencyBadge } from '@/components/currency/CurrencySelector';
import { Currency } from '@cotiza/shared';
import { useCurrency } from '@/hooks/useCurrency';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface PriceDisplayProps {
  amount: number;
  currency: Currency;
  originalAmount?: number;
  originalCurrency?: Currency;
  showConversion?: boolean;
  showTrend?: boolean;
  showBreakdown?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'card' | 'inline' | 'minimal';
  className?: string;
  loading?: boolean;
  hideMinorCurrencies?: boolean;
  conversionDate?: Date;
  breakdown?: {
    subtotal: number;
    tax?: number;
    fees?: number;
    discount?: number;
  };
}

const SIZE_STYLES = {
  sm: {
    price: 'text-lg font-semibold',
    original: 'text-sm',
    trend: 'text-xs',
    badge: 'text-xs',
  },
  md: {
    price: 'text-xl font-bold',
    original: 'text-sm',
    trend: 'text-xs',
    badge: 'text-sm',
  },
  lg: {
    price: 'text-2xl font-bold',
    original: 'text-base',
    trend: 'text-sm',
    badge: 'text-sm',
  },
  xl: {
    price: 'text-3xl font-bold',
    original: 'text-lg',
    trend: 'text-base',
    badge: 'text-base',
  },
};

export function PriceDisplay({
  amount,
  currency,
  originalAmount,
  originalCurrency,
  showConversion = true,
  showTrend = false,
  showBreakdown = false,
  size = 'md',
  variant = 'default',
  className = '',
  loading = false,
  hideMinorCurrencies = false,
  conversionDate,
  breakdown,
}: PriceDisplayProps) {
  const { currency: userCurrency, rates, format } = useCurrency();
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [, setIsConverting] = useState(false);

  const styles = SIZE_STYLES[size];
  const displayCurrency = originalCurrency || currency;
  const displayAmount = originalAmount || amount;

  // Auto-convert to user's preferred currency if different
  useEffect(() => {
    if (showConversion && displayCurrency !== userCurrency && rates[displayCurrency]) {
      setIsConverting(true);
      const rate = rates[displayCurrency];
      const converted = displayAmount / rate;
      setConvertedAmount(converted);
      setIsConverting(false);
    }
  }, [displayAmount, displayCurrency, userCurrency, rates, showConversion]);

  // Mock trend data (would come from API)
  const mockTrend = Math.random() * 4 - 2; // -2% to +2%

  // Format with proper precision
  const getFormattedPrice = (price: number, curr: Currency) => {
    // Handle minor currencies (high-value currencies with many decimals)
    if (hideMinorCurrencies && curr === Currency.JPY) {
      return Math.round(price).toLocaleString();
    }

    return format(price, curr);
  };

  if (loading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-8 w-32" />
        {showConversion && <Skeleton className="h-4 w-24" />}
      </div>
    );
  }

  const renderPrice = (price: number, curr: Currency, styleClass: string) => (
    <div className={cn('flex items-center gap-2', styleClass)}>
      <span className="font-mono">{getFormattedPrice(price, curr)}</span>
      <CurrencyBadge currency={curr} className="opacity-75" />
    </div>
  );

  const renderConversion = () => {
    if (!showConversion || !convertedAmount || displayCurrency === userCurrency) {
      return null;
    }

    return (
      <div className="flex items-center gap-2 opacity-75">
        <span className={cn('text-muted-foreground', styles.original)}>
          ≈ {renderPrice(convertedAmount, userCurrency, '')}
        </span>
        {conversionDate && (
          <span className="text-xs text-muted-foreground">
            ({new Date(conversionDate).toLocaleDateString()})
          </span>
        )}
      </div>
    );
  };

  const renderTrend = () => {
    if (!showTrend) return null;

    const isPositive = mockTrend > 0;
    const isNegative = mockTrend < 0;

    return (
      <Badge
        variant="secondary"
        className={cn(
          styles.trend,
          'flex items-center gap-1',
          isPositive && 'text-green-700 bg-green-50',
          isNegative && 'text-red-700 bg-red-50',
          mockTrend === 0 && 'text-gray-700 bg-gray-50',
        )}
      >
        {isPositive && <TrendingUp className="h-3 w-3" />}
        {isNegative && <TrendingDown className="h-3 w-3" />}
        {Math.abs(mockTrend).toFixed(1)}%
      </Badge>
    );
  };

  const renderBreakdown = () => {
    if (!showBreakdown || !breakdown) return null;

    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <div className="flex justify-between">
          <span>{t('pricing.subtotal')}</span>
          <span>{getFormattedPrice(breakdown.subtotal, displayCurrency)}</span>
        </div>
        {breakdown.tax && (
          <div className="flex justify-between">
            <span>{t('pricing.tax')}</span>
            <span>{getFormattedPrice(breakdown.tax, displayCurrency)}</span>
          </div>
        )}
        {breakdown.fees && (
          <div className="flex justify-between">
            <span>{t('pricing.fees')}</span>
            <span>{getFormattedPrice(breakdown.fees, displayCurrency)}</span>
          </div>
        )}
        {breakdown.discount && (
          <div className="flex justify-between text-green-600">
            <span>{t('pricing.discount')}</span>
            <span>-{getFormattedPrice(breakdown.discount, displayCurrency)}</span>
          </div>
        )}
        <hr className="my-1" />
        <div className="flex justify-between font-medium text-foreground">
          <span>{t('pricing.total')}</span>
          <span>{getFormattedPrice(displayAmount, displayCurrency)}</span>
        </div>
      </div>
    );
  };

  // Render variants
  if (variant === 'minimal') {
    return (
      <span className={cn(styles.price, className)}>
        {getFormattedPrice(displayAmount, displayCurrency)}
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn('inline-flex items-center gap-3', className)}>
        {renderPrice(displayAmount, displayCurrency, styles.price)}
        {renderTrend()}
        {renderConversion()}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            {renderPrice(displayAmount, displayCurrency, styles.price)}
            {renderTrend()}
          </div>

          {renderConversion()}

          {showBreakdown && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full"
            >
              {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showDetails ? t('pricing.hideDetails') : t('pricing.showDetails')}
            </Button>
          )}
        </CardContent>

        {showDetails && <CardFooter className="pt-0 px-4 pb-4">{renderBreakdown()}</CardFooter>}
      </Card>
    );
  }

  // Default variant
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        {renderPrice(displayAmount, displayCurrency, styles.price)}
        {renderTrend()}
      </div>

      {renderConversion()}

      {showBreakdown && breakdown && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="mb-2"
          >
            {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showDetails ? t('pricing.hideDetails') : t('pricing.showDetails')}
          </Button>

          {showDetails && renderBreakdown()}
        </div>
      )}
    </div>
  );
}

// Specialized components for common use cases

export function QuotePrice({
  quote,
  showConversion = true,
  className,
}: {
  quote: {
    totalPrice: number;
    currency: Currency;
    breakdown?: PriceDisplayProps['breakdown'];
  };
  showConversion?: boolean;
  className?: string;
}) {
  return (
    <PriceDisplay
      amount={quote.totalPrice}
      currency={quote.currency}
      showConversion={showConversion}
      showBreakdown={!!quote.breakdown}
      breakdown={quote.breakdown}
      size="lg"
      variant="card"
      className={className}
    />
  );
}

export function ServicePrice({
  price,
  currency,
  originalPrice,
  originalCurrency,
  className,
}: {
  price: number;
  currency: Currency;
  originalPrice?: number;
  originalCurrency?: Currency;
  className?: string;
}) {
  return (
    <PriceDisplay
      amount={price}
      currency={currency}
      originalAmount={originalPrice}
      originalCurrency={originalCurrency}
      showConversion={true}
      showTrend={true}
      size="md"
      variant="inline"
      className={className}
    />
  );
}

export function CompactPrice({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: Currency;
  className?: string;
}) {
  return (
    <PriceDisplay
      amount={amount}
      currency={currency}
      showConversion={false}
      size="sm"
      variant="minimal"
      className={className}
    />
  );
}

// Price comparison component
export function PriceComparison({
  prices,
  className,
}: {
  prices: { label: string; amount: number; currency: Currency }[];
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {prices.map((price, index) => (
        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
          <span className="font-medium">{price.label}</span>
          <ServicePrice price={price.amount} currency={price.currency} />
        </div>
      ))}
    </div>
  );
}
