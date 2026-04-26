/**
 * Geo-detection and multicurrency types for Cotiza Studio
 */

import { Currency } from './enums';
import { Locale } from './common';

export interface GeoDetection {
  detected: {
    country: string;
    countryCode: string;
    city?: string;
    region?: string;
    timezone: string;
    locale: string;
    currency: Currency;
    confidence: number; // 0-100
    source: 'edge-header' | 'ip-service' | 'browser' | 'default';
  };
  recommended: {
    locale: string;
    currency: Currency;
    alternativeLocales: string[];
    alternativeCurrencies: Currency[];
  };
  userPreferences?: UserPreferences;
}

export interface UserPreferences {
  locale: string;
  currency: Currency;
  timezone?: string;
  autoDetect: boolean;
  currencyDisplayMode?: 'symbol' | 'code' | 'name';
}

export interface GeoMapping {
  country: string;
  defaultCurrency: Currency;
  defaultLocale: string;
  supportedCurrencies: Currency[];
  timezone: string;
  dialCode?: string;
  flag?: string;
}

export interface ExchangeRate {
  baseCurrency: Currency;
  targetCurrency: Currency;
  rate: number;
  source: string;
  validFrom: Date;
  validUntil: Date;
  createdAt: Date;
}

export interface ConversionResult {
  originalAmount: number;
  originalCurrency: Currency;
  convertedAmount: number;
  convertedCurrency: Currency;
  rate: number;
  inverseRate: number;
  fees?: {
    percentage: number;
    fixed: number;
    total: number;
  };
  timestamp: Date;
}

export interface ConversionOptions {
  date?: Date;
  includeFees?: boolean;
  roundingMode?: 'floor' | 'ceil' | 'round';
}

// Re-export types for convenience
export type { Currency, Locale };

// Country code mapping
export const COUNTRY_CURRENCY_MAP: Record<string, Currency> = {
  // Americas
  MX: Currency.MXN,
  US: Currency.USD,
  CA: Currency.CAD,
  BR: Currency.BRL,
  AR: Currency.ARS,
  CL: Currency.CLP,
  CO: Currency.COP,
  PE: Currency.PEN,

  // Europe
  ES: Currency.EUR,
  FR: Currency.EUR,
  DE: Currency.EUR,
  IT: Currency.EUR,
  NL: Currency.EUR,
  BE: Currency.EUR,
  AT: Currency.EUR,
  PT: Currency.EUR,
  IE: Currency.EUR,
  FI: Currency.EUR,
  GR: Currency.EUR,
  GB: Currency.GBP,
  CH: Currency.CHF,
  SE: Currency.SEK,
  NO: Currency.NOK,
  DK: Currency.DKK,
  PL: Currency.PLN,

  // Asia Pacific
  CN: Currency.CNY,
  JP: Currency.JPY,
  KR: Currency.KRW,
  IN: Currency.INR,
  SG: Currency.SGD,
  HK: Currency.HKD,
  AU: Currency.AUD,
  NZ: Currency.NZD,
  TW: Currency.TWD,
  TH: Currency.THB,

  // Middle East & Africa
  AE: Currency.AED,
  SA: Currency.SAR,
  ZA: Currency.ZAR,
  EG: Currency.EGP,
};

export const COUNTRY_LOCALE_MAP: Record<string, Locale> = {
  MX: 'es',
  ES: 'es',
  AR: 'es',
  CL: 'es',
  CO: 'es',
  PE: 'es',
  BR: 'pt-BR',
  PT: 'pt-BR', // Use Brazilian Portuguese for Portugal too
  // Everything else defaults to English
};

export const GEO_MAPPINGS: Record<string, GeoMapping> = {
  MX: {
    country: 'Mexico',
    defaultCurrency: Currency.MXN,
    defaultLocale: 'es',
    supportedCurrencies: [Currency.MXN, Currency.USD],
    timezone: 'America/Mexico_City',
    dialCode: '+52',
    flag: '🇲🇽',
  },
  US: {
    country: 'United States',
    defaultCurrency: Currency.USD,
    defaultLocale: 'en',
    supportedCurrencies: [Currency.USD],
    timezone: 'America/New_York',
    dialCode: '+1',
    flag: '🇺🇸',
  },
  CA: {
    country: 'Canada',
    defaultCurrency: Currency.CAD,
    defaultLocale: 'en',
    supportedCurrencies: [Currency.CAD, Currency.USD],
    timezone: 'America/Toronto',
    dialCode: '+1',
    flag: '🇨🇦',
  },
  BR: {
    country: 'Brazil',
    defaultCurrency: Currency.BRL,
    defaultLocale: 'pt-BR',
    supportedCurrencies: [Currency.BRL, Currency.USD],
    timezone: 'America/Sao_Paulo',
    dialCode: '+55',
    flag: '🇧🇷',
  },
  ES: {
    country: 'Spain',
    defaultCurrency: Currency.EUR,
    defaultLocale: 'es',
    supportedCurrencies: [Currency.EUR],
    timezone: 'Europe/Madrid',
    dialCode: '+34',
    flag: '🇪🇸',
  },
  GB: {
    country: 'United Kingdom',
    defaultCurrency: Currency.GBP,
    defaultLocale: 'en',
    supportedCurrencies: [Currency.GBP, Currency.EUR],
    timezone: 'Europe/London',
    dialCode: '+44',
    flag: '🇬🇧',
  },
  // Add more as needed
};

export const CURRENCY_CONFIG: Record<
  Currency,
  {
    symbol: string;
    position: 'before' | 'after';
    decimals: number;
    separator: ',' | '.';
    name: string;
  }
> = {
  [Currency.MXN]: {
    symbol: '$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Mexican Peso',
  },
  [Currency.USD]: {
    symbol: '$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'US Dollar',
  },
  [Currency.EUR]: {
    symbol: '€',
    position: 'after',
    decimals: 2,
    separator: '.',
    name: 'Euro',
  },
  [Currency.BRL]: {
    symbol: 'R$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Brazilian Real',
  },
  [Currency.GBP]: {
    symbol: '£',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'British Pound',
  },
  [Currency.CAD]: {
    symbol: 'C$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Canadian Dollar',
  },
  [Currency.CNY]: {
    symbol: '¥',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Chinese Yuan',
  },
  [Currency.JPY]: {
    symbol: '¥',
    position: 'before',
    decimals: 0,
    separator: ',',
    name: 'Japanese Yen',
  },
  [Currency.ARS]: {
    symbol: '$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Argentine Peso',
  },
  [Currency.CLP]: {
    symbol: '$',
    position: 'before',
    decimals: 0,
    separator: '.',
    name: 'Chilean Peso',
  },
  [Currency.COP]: {
    symbol: '$',
    position: 'before',
    decimals: 0,
    separator: ',',
    name: 'Colombian Peso',
  },
  [Currency.PEN]: {
    symbol: 'S/',
    position: 'before',
    decimals: 2,
    separator: '.',
    name: 'Peruvian Sol',
  },
  [Currency.CHF]: {
    symbol: 'CHF',
    position: 'before',
    decimals: 2,
    separator: '.',
    name: 'Swiss Franc',
  },
  [Currency.SEK]: {
    symbol: 'kr',
    position: 'after',
    decimals: 2,
    separator: ',',
    name: 'Swedish Krona',
  },
  [Currency.NOK]: {
    symbol: 'kr',
    position: 'after',
    decimals: 2,
    separator: ',',
    name: 'Norwegian Krone',
  },
  [Currency.DKK]: {
    symbol: 'kr',
    position: 'after',
    decimals: 2,
    separator: ',',
    name: 'Danish Krone',
  },
  [Currency.PLN]: {
    symbol: 'zł',
    position: 'after',
    decimals: 2,
    separator: ',',
    name: 'Polish Zloty',
  },
  [Currency.KRW]: {
    symbol: '₩',
    position: 'before',
    decimals: 0,
    separator: ',',
    name: 'South Korean Won',
  },
  [Currency.INR]: {
    symbol: '₹',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Indian Rupee',
  },
  [Currency.SGD]: {
    symbol: 'S$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Singapore Dollar',
  },
  [Currency.HKD]: {
    symbol: 'HK$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Hong Kong Dollar',
  },
  [Currency.AUD]: {
    symbol: 'A$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Australian Dollar',
  },
  [Currency.NZD]: {
    symbol: 'NZ$',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'New Zealand Dollar',
  },
  [Currency.TWD]: {
    symbol: 'NT$',
    position: 'before',
    decimals: 0,
    separator: ',',
    name: 'Taiwan Dollar',
  },
  [Currency.THB]: {
    symbol: '฿',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Thai Baht',
  },
  [Currency.AED]: {
    symbol: 'د.إ',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'UAE Dirham',
  },
  [Currency.SAR]: {
    symbol: '﷼',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Saudi Riyal',
  },
  [Currency.ZAR]: {
    symbol: 'R',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'South African Rand',
  },
  [Currency.EGP]: {
    symbol: '£',
    position: 'before',
    decimals: 2,
    separator: ',',
    name: 'Egyptian Pound',
  },
};

// Helper functions
export const getDefaultCurrencyForCountry = (countryCode: string): Currency => {
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()] || Currency.USD;
};

export const getDefaultLocaleForCountry = (countryCode: string): Locale => {
  return COUNTRY_LOCALE_MAP[countryCode.toUpperCase()] || 'en';
};

export const getGeoMapping = (countryCode: string): GeoMapping | null => {
  return GEO_MAPPINGS[countryCode.toUpperCase()] || null;
};

export const formatCurrency = (amount: number, currency: Currency, locale?: string): string => {
  const config = CURRENCY_CONFIG[currency];
  if (!config) return `${amount} ${currency}`;

  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  } catch (error) {
    // Fallback formatting
    const formatted =
      config.decimals === 0 ? Math.round(amount).toLocaleString() : amount.toFixed(config.decimals);

    return config.position === 'before'
      ? `${config.symbol}${formatted}`
      : `${formatted} ${config.symbol}`;
  }
};

export const getCurrencySymbol = (currency: Currency): string => {
  return CURRENCY_CONFIG[currency]?.symbol || currency;
};

export const getCurrencyName = (currency: Currency): string => {
  return CURRENCY_CONFIG[currency]?.name || currency;
};
