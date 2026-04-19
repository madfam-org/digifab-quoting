import { UUID, Locale, Timestamped } from './common';
import { Currency } from './enums';

export interface Tenant extends Timestamped {
  id: UUID;
  name: string;
  code: string;
  domain?: string;
  defaultCurrency: Currency;
  supportedCurrencies: Currency[];
  defaultLocale: Locale;
  supportedLocales: Locale[];
  features: TenantFeatures;
  settings: TenantSettings;
  branding: TenantBranding;
  active: boolean;
}

export interface TenantFeatures {
  supplierPortal: boolean;
  dynamicScheduling: boolean;
  euRegion: boolean;
  whatsappNotifications: boolean;
  bankTransferReconciliation: boolean;
  // Gates services-mode quoting (hourly / fixed-fee / milestone).
  // Internal-only today (MADFAM tenant). Will be exposed to Cotiza
  // tenants once the services flow is proven.
  servicesQuotes: boolean;
  [key: string]: boolean;
}

export interface TenantSettings {
  quoteValidityDays: number;
  maxFileSizeMB: number;
  maxFilesPerQuote: number;
  autoQuoteTimeoutSeconds: number;
  dataRetentionDays: {
    quotes: number;
    orders: number;
    files: number;
  };
  notifications: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
}

export interface TenantBranding {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily?: string;
  emailFooter?: string;
  customCss?: string;
}
