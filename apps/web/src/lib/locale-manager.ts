export type Locale = 'es' | 'en' | 'pt-BR';

const LOCALE_KEY = 'preferredLocale';
const SUPPORTED_LOCALES: Locale[] = ['es', 'en', 'pt-BR'];
const DEFAULT_LOCALE: Locale = 'es';

export class LocaleManager {
  /**
   * Get the user's preferred locale from multiple sources
   */
  static getPreferredLocale(): Locale {
    // 1. Check URL path
    const pathLocale = this.getLocaleFromPath();
    if (pathLocale) return pathLocale;

    // 2. Check localStorage
    const storedLocale = this.getStoredLocale();
    if (storedLocale) return storedLocale;

    // 3. Check browser language
    const browserLocale = this.getBrowserLocale();
    if (browserLocale) return browserLocale;

    // 4. Return default
    return DEFAULT_LOCALE;
  }

  /**
   * Save locale preference to localStorage
   */
  static saveLocale(locale: Locale): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALE_KEY, locale);
    }
  }

  /**
   * Get locale from URL path
   */
  static getLocaleFromPath(): Locale | null {
    if (typeof window === 'undefined') return null;

    const path = window.location.pathname;
    const segments = path.split('/');
    const firstSegment = segments[1];

    if (SUPPORTED_LOCALES.includes(firstSegment as Locale)) {
      return firstSegment as Locale;
    }

    return null;
  }

  /**
   * Get locale from localStorage
   */
  static getStoredLocale(): Locale | null {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
        return stored as Locale;
      }
    } catch (error) {
      console.error('Error reading locale from localStorage:', error);
    }

    return null;
  }

  /**
   * Detect locale from browser settings
   */
  static getBrowserLocale(): Locale | null {
    if (typeof window === 'undefined') return null;

    try {
      const browserLang =
        navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage;

      if (browserLang) {
        // Direct matches
        if (browserLang.startsWith('es')) return 'es';
        if (browserLang.startsWith('en')) return 'en';
        if (browserLang.toLowerCase() === 'pt-br') return 'pt-BR';
        if (browserLang.startsWith('pt')) return 'pt-BR';
      }

      // Check all languages
      const languages = navigator.languages || (browserLang ? [browserLang] : []);
      for (const lang of languages) {
        const locale = this.mapBrowserLangToLocale(lang);
        if (locale) return locale;
      }
    } catch (error) {
      console.error('Error detecting browser locale:', error);
    }

    return null;
  }

  /**
   * Map browser language code to our locale
   */
  private static mapBrowserLangToLocale(browserLang: string): Locale | null {
    const lang = browserLang.toLowerCase();

    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('en')) return 'en';
    if (lang === 'pt-br' || lang.startsWith('pt-br')) return 'pt-BR';
    if (lang.startsWith('pt')) return 'pt-BR';

    return null;
  }

  /**
   * Build localized path
   */
  static buildLocalizedPath(path: string, locale: Locale): string {
    // Remove existing locale from path
    const cleanPath = path.replace(/^\/(es|en|pt-BR)/, '');

    // Add new locale
    return `/${locale}${cleanPath || '/'}`;
  }

  /**
   * Redirect to localized version of current page
   */
  static redirectToLocale(locale: Locale): void {
    if (typeof window === 'undefined') return;

    const currentPath = window.location.pathname;
    const newPath = this.buildLocalizedPath(currentPath, locale);

    if (newPath !== currentPath) {
      window.location.href = newPath;
    }
  }

  /**
   * Initialize locale on app startup
   */
  static initialize(): Locale {
    const locale = this.getPreferredLocale();

    // Save to localStorage for consistency
    this.saveLocale(locale);

    // Set HTML lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }

    return locale;
  }

  /**
   * Get locale display name
   */
  static getLocaleName(locale: Locale): string {
    const names: Record<Locale, string> = {
      es: 'Español',
      en: 'English',
      'pt-BR': 'Português (Brasil)',
    };
    return names[locale] || locale;
  }

  /**
   * Get locale flag emoji
   */
  static getLocaleFlag(locale: Locale): string {
    const flags: Record<Locale, string> = {
      es: '🇪🇸',
      en: '🇺🇸',
      'pt-BR': '🇧🇷',
    };
    return flags[locale] || '🌍';
  }
}
