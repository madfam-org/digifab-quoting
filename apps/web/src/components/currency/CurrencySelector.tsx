'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Globe, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Currency, getCurrencySymbol, getCurrencyName } from '@cotiza/shared';
import { useCurrency } from '@/hooks/useCurrency';

interface CurrencySelectorProps {
  value?: Currency;
  onChange?: (currency: Currency) => void;
  supportedCurrencies?: Currency[];
  showFlags?: boolean;
  showRates?: boolean;
  showTrends?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  placeholder?: string;
}

// Currency flag mapping (Unicode flags)
const CURRENCY_FLAGS: Record<Currency, string> = {
  [Currency.MXN]: '🇲🇽',
  [Currency.USD]: '🇺🇸',
  [Currency.EUR]: '🇪🇺',
  [Currency.BRL]: '🇧🇷',
  [Currency.GBP]: '🇬🇧',
  [Currency.CAD]: '🇨🇦',
  [Currency.CNY]: '🇨🇳',
  [Currency.JPY]: '🇯🇵',
  [Currency.ARS]: '🇦🇷',
  [Currency.CLP]: '🇨🇱',
  [Currency.COP]: '🇨🇴',
  [Currency.PEN]: '🇵🇪',
  [Currency.CHF]: '🇨🇭',
  [Currency.SEK]: '🇸🇪',
  [Currency.NOK]: '🇳🇴',
  [Currency.DKK]: '🇩🇰',
  [Currency.PLN]: '🇵🇱',
  [Currency.KRW]: '🇰🇷',
  [Currency.INR]: '🇮🇳',
  [Currency.SGD]: '🇸🇬',
  [Currency.HKD]: '🇭🇰',
  [Currency.AUD]: '🇦🇺',
  [Currency.NZD]: '🇳🇿',
  [Currency.TWD]: '🇹🇼',
  [Currency.THB]: '🇹🇭',
  [Currency.AED]: '🇦🇪',
  [Currency.SAR]: '🇸🇦',
  [Currency.ZAR]: '🇿🇦',
  [Currency.EGP]: '🇪🇬',
};

// Mock exchange rate trends (would come from API)
const MOCK_TRENDS: Record<Currency, number> = {
  [Currency.MXN]: -0.5,
  [Currency.USD]: 0,
  [Currency.EUR]: 0.3,
  [Currency.BRL]: -1.2,
  [Currency.GBP]: 0.8,
  [Currency.CAD]: -0.2,
  [Currency.CNY]: 0.1,
  [Currency.JPY]: -0.7,
  [Currency.ARS]: -2.5,
  [Currency.CLP]: -0.9,
  [Currency.COP]: -1.1,
  [Currency.PEN]: 0.2,
  [Currency.CHF]: 0.4,
  [Currency.SEK]: -0.3,
  [Currency.NOK]: 0.6,
  [Currency.DKK]: 0.3,
  [Currency.PLN]: -0.1,
  [Currency.KRW]: -0.4,
  [Currency.INR]: 0.7,
  [Currency.SGD]: 0.1,
  [Currency.HKD]: 0.0,
  [Currency.AUD]: 0.5,
  [Currency.NZD]: 0.3,
  [Currency.TWD]: -0.2,
  [Currency.THB]: 0.4,
  [Currency.AED]: 0.0,
  [Currency.SAR]: 0.0,
  [Currency.ZAR]: -1.3,
  [Currency.EGP]: -1.8,
};

export function CurrencySelector({
  value,
  onChange,
  supportedCurrencies,
  showFlags = true,
  showRates = false,
  showTrends = false,
  disabled = false,
  size = 'md',
  variant = 'outline',
  className = '',
}: CurrencySelectorProps) {
  const { currency: defaultCurrency, setCurrency, rates } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCurrency = value || defaultCurrency;

  // Use provided currencies or all supported ones
  const availableCurrencies = supportedCurrencies || Object.values(Currency);

  // Filter currencies based on search query
  const filteredCurrencies = availableCurrencies.filter((curr) => {
    const query = searchQuery.toLowerCase();
    const name = getCurrencyName(curr).toLowerCase();
    const code = curr.toLowerCase();
    return name.includes(query) || code.includes(query);
  });

  // Handle currency selection
  const handleCurrencySelect = async (currency: Currency) => {
    if (onChange) {
      onChange(currency);
    } else {
      await setCurrency(currency);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Size styles
  const sizeStyles = {
    sm: {
      trigger: 'h-8 px-2 text-sm',
      content: 'w-64',
      item: 'h-8 text-sm',
    },
    md: {
      trigger: 'h-10 px-3',
      content: 'w-80',
      item: 'h-10',
    },
    lg: {
      trigger: 'h-12 px-4 text-lg',
      content: 'w-96',
      item: 'h-12 text-base',
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          disabled={disabled}
          className={`${currentSize.trigger} justify-between ${className}`}
          aria-label={`Selected currency: ${selectedCurrency}`}
        >
          <div className="flex items-center gap-2">
            {showFlags && (
              <span className="text-base" role="img" aria-label={`${selectedCurrency} flag`}>
                {CURRENCY_FLAGS[selectedCurrency] || '🏳️'}
              </span>
            )}
            <span className="font-medium">{selectedCurrency}</span>
            <span className="text-muted-foreground">{getCurrencySymbol(selectedCurrency)}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={`${currentSize.content} max-h-80 overflow-hidden`}
        align="end"
      >
        {/* Search */}
        <div className="p-2">
          <div className="relative">
            <Globe className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search currencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Header */}
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Available Currencies</span>
          {showRates && (
            <span className="text-xs font-normal text-muted-foreground">vs {selectedCurrency}</span>
          )}
        </DropdownMenuLabel>

        {/* Currency List */}
        <div className="max-h-64 overflow-y-auto">
          {filteredCurrencies.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No currencies found matching "{searchQuery}"
            </div>
          ) : (
            filteredCurrencies.map((curr) => {
              const isSelected = curr === selectedCurrency;
              const rate = rates[curr];
              const trend = MOCK_TRENDS[curr];

              return (
                <DropdownMenuItem
                  key={curr}
                  className={`${currentSize.item} cursor-pointer ${isSelected ? 'bg-accent' : ''}`}
                  onSelect={() => handleCurrencySelect(curr)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      {showFlags && (
                        <span className="text-lg" role="img" aria-label={`${curr} flag`}>
                          {CURRENCY_FLAGS[curr] || '🏳️'}
                        </span>
                      )}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{curr}</span>
                          <span className="text-sm text-muted-foreground">
                            {getCurrencySymbol(curr)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {getCurrencyName(curr)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Exchange Rate */}
                      {showRates && rate && curr !== selectedCurrency && (
                        <span className="text-sm font-mono text-muted-foreground">
                          {rate.toFixed(rate < 1 ? 4 : 2)}
                        </span>
                      )}

                      {/* Trend Indicator */}
                      {showTrends && trend !== undefined && (
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            trend > 0
                              ? 'text-green-700 bg-green-50'
                              : trend < 0
                                ? 'text-red-700 bg-red-50'
                                : 'text-gray-700 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {trend > 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : trend < 0 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : null}
                            {Math.abs(trend).toFixed(1)}%
                          </div>
                        </Badge>
                      )}

                      {/* Selected Indicator */}
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        {/* Footer */}
        {showRates && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 text-xs text-muted-foreground text-center">
              Exchange rates updated every hour
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simplified version for inline use
export function CurrencyBadge({
  currency,
  showFlag = true,
  showSymbol = true,
  className = '',
}: {
  currency: Currency;
  showFlag?: boolean;
  showSymbol?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {showFlag && (
        <span className="text-sm" role="img" aria-label={`${currency} flag`}>
          {CURRENCY_FLAGS[currency] || '🏳️'}
        </span>
      )}
      <span className="font-medium">{currency}</span>
      {showSymbol && (
        <span className="text-muted-foreground text-sm">{getCurrencySymbol(currency)}</span>
      )}
    </div>
  );
}

// Quick currency toggle for common pairs
export function CurrencyToggle({
  currencies,
  value,
  onChange,
  className = '',
}: {
  currencies: [Currency, Currency];
  value: Currency;
  onChange: (currency: Currency) => void;
  className?: string;
}) {
  const [primary, secondary] = currencies;

  return (
    <div className={`inline-flex rounded-lg border p-1 ${className}`}>
      <button
        onClick={() => onChange(primary)}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          value === primary ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        }`}
      >
        <CurrencyBadge currency={primary} showFlag={false} />
      </button>
      <button
        onClick={() => onChange(secondary)}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          value === secondary ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        }`}
      >
        <CurrencyBadge currency={secondary} showFlag={false} />
      </button>
    </div>
  );
}
