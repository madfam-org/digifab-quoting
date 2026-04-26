'use client';

import { useEffect, useState } from 'react';

type TranslationDictionary = {
  [key: string]: string | TranslationDictionary;
};

const translationCache = new Map<string, TranslationDictionary>();

// Get initial locale (SSR-safe)
function getInitialLocale(): string {
  if (typeof window === 'undefined') {
    return 'es'; // Default for SSR
  }

  const storedLocale = localStorage.getItem('locale');
  if (storedLocale) return storedLocale;

  const browserLocale = navigator.language.split('-')[0];
  const supportedLocales = ['es', 'en', 'pt-BR'];

  return supportedLocales.includes(browserLocale) ? browserLocale : 'es';
}

export function useTranslation(namespace = 'common') {
  // In App Router, we'll manage locale differently
  const [locale, setLocale] = useState(() => getInitialLocale());
  const [translations, setTranslations] = useState<TranslationDictionary>({});
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Update locale on client side
    const actualLocale = getInitialLocale();
    if (actualLocale !== locale) {
      setLocale(actualLocale);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return; // Skip on SSR
    const loadTranslations = async () => {
      const cacheKey = `${locale}/${namespace}`;

      // Check cache first
      const cached = translationCache.get(cacheKey);
      if (cached) {
        setTranslations(cached);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/locales/${locale}/${namespace}.json`);
        if (!response.ok) {
          console.error(`Failed to load translations for ${locale}/${namespace}`);
          // Try to fallback to Spanish
          if (locale !== 'es') {
            const fallbackResponse = await fetch(`/locales/es/${namespace}.json`);
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              translationCache.set(cacheKey, fallbackData);
              setTranslations(fallbackData);
            }
          }
        } else {
          const data = await response.json();
          translationCache.set(cacheKey, data);
          setTranslations(data);
        }
      } catch (error) {
        console.error('Error loading translations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTranslations();
  }, [locale, namespace, mounted]);

  /**
   * Get translation by key with optional parameter interpolation
   * @param key - Dot-separated path to translation (e.g., 'hero.title')
   * @param params - Optional parameters for interpolation
   * @returns Translated string or key if not found
   */
  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: string | TranslationDictionary = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation missing: ${key} for locale: ${locale}`);
        return key;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`Translation value is not a string: ${key}`);
      return key;
    }

    // Interpolate parameters if provided
    if (params) {
      return Object.entries(params).reduce(
        (str, [paramKey, paramValue]) =>
          str.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue)),
        value,
      );
    }

    return value;
  };

  /**
   * Check if a translation key exists
   */
  const hasTranslation = (key: string): boolean => {
    const keys = key.split('.');
    let value: string | TranslationDictionary = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return false;
      }
    }

    return typeof value === 'string';
  };

  /**
   * Format number according to locale
   */
  const formatNumber = (num: number, options?: Intl.NumberFormatOptions): string => {
    return new Intl.NumberFormat(locale === 'pt-BR' ? 'pt-BR' : locale, options).format(num);
  };

  /**
   * Format currency according to locale
   */
  const formatCurrency = (amount: number, currency = 'MXN'): string => {
    const currencyMap: Record<string, string> = {
      es: 'MXN',
      en: 'USD',
      'pt-BR': 'BRL',
    };

    const localeCurrency = currency || currencyMap[locale] || 'MXN';

    return new Intl.NumberFormat(locale === 'pt-BR' ? 'pt-BR' : locale, {
      style: 'currency',
      currency: localeCurrency,
    }).format(amount);
  };

  /**
   * Format date according to locale
   */
  const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale === 'pt-BR' ? 'pt-BR' : locale, options).format(dateObj);
  };

  /**
   * Get locale-specific routes
   */
  const localizedPath = (path: string): string => {
    // For default locale (Spanish), don't add prefix
    if (locale === 'es') {
      return path;
    }
    // For other locales, add the locale prefix
    return `/${locale}${path}`;
  };

  /**
   * Change the application language
   */
  const changeLanguage = (newLocale: string) => {
    setLocale(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
      // Force reload to apply new translations
      window.location.reload();
    }
  };

  return {
    t,
    locale,
    isLoading,
    hasTranslation,
    formatNumber,
    formatCurrency,
    formatDate,
    localizedPath,
    changeLanguage,
  };
}
