'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Currency,
  formatCurrency,
  getCurrencySymbol,
  getCurrencyName,
  CURRENCY_CONFIG,
} from '@cotiza/shared';
import { useGeoDetection } from './useGeoDetection';

interface ExchangeRates {
  base: Currency;
  date: string;
  rates: Record<Currency, number>;
  source: string;
  updatedAt: string;
}

interface ConversionResult {
  originalAmount: number;
  originalCurrency: Currency;
  convertedAmount: number;
  convertedCurrency: Currency;
  rate: number;
  inverseRate: number;
  timestamp: Date;
}

interface UseCurrencyReturn {
  // Current currency
  currency: Currency;
  setCurrency: (currency: Currency) => Promise<void>;

  // Exchange rates
  rates: Record<Currency, number>;
  ratesLoading: boolean;
  ratesError: string | null;
  lastUpdated: string | null;

  // Formatting functions
  format: (amount: number, targetCurrency?: Currency, locale?: string) => string;
  symbol: (currency?: Currency) => string;
  name: (currency?: Currency) => string;

  // Conversion functions
  convert: (amount: number, from: Currency, to?: Currency) => number;
  convertWithDetails: (amount: number, from: Currency, to?: Currency) => ConversionResult;

  // Available currencies
  supportedCurrencies: Currency[];

  // Rate management
  refreshRates: () => Promise<void>;
}

const RATES_CACHE_KEY = 'cotiza-exchange-rates';
const RATES_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export function useCurrency(): UseCurrencyReturn {
  const { currency: detectedCurrency, updatePreferences } = useGeoDetection();

  const [currency, setCurrencyState] = useState<Currency>(detectedCurrency);
  const [rates, setRates] = useState<Record<Currency, number>>({} as Record<Currency, number>);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Update currency when geo-detection changes
  useEffect(() => {
    if (detectedCurrency && detectedCurrency !== currency) {
      setCurrencyState(detectedCurrency);
    }
  }, [detectedCurrency]);

  // Supported currencies (can be made configurable)
  const supportedCurrencies: Currency[] = useMemo(
    () => [
      Currency.MXN,
      Currency.USD,
      Currency.EUR,
      Currency.BRL,
      Currency.GBP,
      Currency.CAD,
      Currency.CNY,
      Currency.JPY,
    ],
    [],
  );

  const loadRatesFromCache = useCallback((): ExchangeRates | null => {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(RATES_CACHE_KEY);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      const now = Date.now();

      if (now - parsed.timestamp > RATES_CACHE_DURATION) {
        localStorage.removeItem(RATES_CACHE_KEY);
        return null;
      }

      return parsed.data;
    } catch {
      localStorage.removeItem(RATES_CACHE_KEY);
      return null;
    }
  }, []);

  const saveRatesToCache = useCallback((data: ExchangeRates): void => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(
        RATES_CACHE_KEY,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      console.warn('Failed to cache exchange rates:', error);
    }
  }, []);

  const fetchRates = useCallback(
    async (base: Currency = currency): Promise<ExchangeRates> => {
      const response = await fetch(`/api/v1/currency/rates?base=${base}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch rates: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },
    [currency],
  );

  const loadRates = useCallback(
    async (base: Currency = currency): Promise<void> => {
      setRatesLoading(true);
      setRatesError(null);

      try {
        // Try cache first
        const cached = loadRatesFromCache();
        if (cached && cached.base === base) {
          setRates(cached.rates);
          setLastUpdated(cached.updatedAt);
          setRatesLoading(false);
          return;
        }

        // Fetch from API
        const data = await fetchRates(base);

        // Update state
        setRates(data.rates);
        setLastUpdated(data.updatedAt);

        // Cache for next time
        saveRatesToCache(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load exchange rates';
        setRatesError(message);

        // Fallback rates (USD base)
        const fallbackRates: Record<Currency, number> = {
          [Currency.USD]: 1,
          [Currency.MXN]: 17.5,
          [Currency.EUR]: 0.85,
          [Currency.BRL]: 5.2,
          [Currency.GBP]: 0.75,
          [Currency.CAD]: 1.35,
          [Currency.CNY]: 7.2,
          [Currency.JPY]: 150,
          [Currency.ARS]: 350,
          [Currency.CLP]: 800,
          [Currency.COP]: 4000,
          [Currency.PEN]: 3.7,
          [Currency.CHF]: 0.9,
          [Currency.SEK]: 10.5,
          [Currency.NOK]: 10.8,
          [Currency.DKK]: 6.8,
          [Currency.PLN]: 4.2,
          [Currency.KRW]: 1300,
          [Currency.INR]: 83,
          [Currency.SGD]: 1.35,
          [Currency.HKD]: 7.8,
          [Currency.AUD]: 1.5,
          [Currency.NZD]: 1.6,
          [Currency.TWD]: 31,
          [Currency.THB]: 35,
          [Currency.AED]: 3.67,
          [Currency.SAR]: 3.75,
          [Currency.ZAR]: 18,
          [Currency.EGP]: 31,
        };

        setRates(fallbackRates);
        setLastUpdated(new Date().toISOString());
      } finally {
        setRatesLoading(false);
      }
    },
    [currency, fetchRates, loadRatesFromCache, saveRatesToCache],
  );

  const refreshRates = useCallback(async (): Promise<void> => {
    // Clear cache and reload
    if (typeof window !== 'undefined') {
      localStorage.removeItem(RATES_CACHE_KEY);
    }
    await loadRates(currency);
  }, [currency, loadRates]);

  const setCurrency = useCallback(
    async (newCurrency: Currency): Promise<void> => {
      setCurrencyState(newCurrency);

      // Update user preferences
      try {
        await updatePreferences({ currency: newCurrency });
      } catch (error) {
        console.warn('Failed to save currency preference:', error);
      }

      // Load rates for new currency
      await loadRates(newCurrency);
    },
    [updatePreferences, loadRates],
  );

  // Load rates when currency changes
  useEffect(() => {
    if (currency) {
      loadRates(currency);
    }
  }, [currency, loadRates]);

  // Formatting function with locale support
  const format = useCallback(
    (amount: number, targetCurrency: Currency = currency, locale?: string): string => {
      try {
        return formatCurrency(amount, targetCurrency, locale);
      } catch (error) {
        // Fallback formatting
        const config = CURRENCY_CONFIG[targetCurrency];
        if (!config) return `${amount} ${targetCurrency}`;

        const formatted =
          config.decimals === 0
            ? Math.round(amount).toLocaleString()
            : amount.toFixed(config.decimals);

        return config.position === 'before'
          ? `${config.symbol}${formatted}`
          : `${formatted} ${config.symbol}`;
      }
    },
    [currency],
  );

  const symbol = useCallback(
    (targetCurrency: Currency = currency): string => {
      return getCurrencySymbol(targetCurrency);
    },
    [currency],
  );

  const name = useCallback(
    (targetCurrency: Currency = currency): string => {
      return getCurrencyName(targetCurrency);
    },
    [currency],
  );

  // Simple conversion
  const convert = useCallback(
    (amount: number, from: Currency, to: Currency = currency): number => {
      if (from === to) return amount;

      // Convert through USD if needed
      let result = amount;

      if (from !== Currency.USD) {
        const fromRate = rates[from];
        if (!fromRate) return amount; // No rate available
        result = amount / fromRate; // Convert to USD
      }

      if (to !== Currency.USD) {
        const toRate = rates[to];
        if (!toRate) return result; // No rate available
        result = result * toRate; // Convert from USD to target
      }

      // Round based on currency
      const config = CURRENCY_CONFIG[to];
      const decimals = config?.decimals || 2;
      return Math.round(result * Math.pow(10, decimals)) / Math.pow(10, decimals);
    },
    [currency, rates],
  );

  // Detailed conversion with metadata
  const convertWithDetails = useCallback(
    (amount: number, from: Currency, to: Currency = currency): ConversionResult => {
      if (from === to) {
        return {
          originalAmount: amount,
          originalCurrency: from,
          convertedAmount: amount,
          convertedCurrency: to,
          rate: 1,
          inverseRate: 1,
          timestamp: new Date(),
        };
      }

      const convertedAmount = convert(amount, from, to);
      const rate = convertedAmount / amount;
      const inverseRate = amount / convertedAmount;

      return {
        originalAmount: amount,
        originalCurrency: from,
        convertedAmount,
        convertedCurrency: to,
        rate,
        inverseRate,
        timestamp: new Date(),
      };
    },
    [currency, convert],
  );

  return {
    currency,
    setCurrency,
    rates,
    ratesLoading,
    ratesError,
    lastUpdated,
    format,
    symbol,
    name,
    convert,
    convertWithDetails,
    supportedCurrencies,
    refreshRates,
  };
}
