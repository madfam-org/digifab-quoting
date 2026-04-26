import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export type Locale = 'es' | 'en' | 'pt-BR';

export interface LocalizedRequest extends Request {
  locale: Locale;
  acceptedLanguages: string[];
}

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  private readonly defaultLocale: Locale = 'es';
  private readonly supportedLocales: Locale[] = ['es', 'en', 'pt-BR'];

  use(req: LocalizedRequest, res: Response, next: NextFunction) {
    // Priority order for locale detection:
    // 1. Query parameter (?locale=en)
    // 2. Custom header (X-Locale)
    // 3. Accept-Language header
    // 4. User's stored preference (if authenticated)
    // 5. Default locale

    let locale = this.defaultLocale;
    const acceptedLanguages: string[] = [];

    // 1. Check query parameter
    if (req.query.locale && typeof req.query.locale === 'string') {
      const queryLocale = req.query.locale as Locale;
      if (this.supportedLocales.includes(queryLocale)) {
        locale = queryLocale;
      }
    }

    // 2. Check custom header
    if (!locale && req.headers['x-locale']) {
      const headerLocale = req.headers['x-locale'] as string;
      if (this.supportedLocales.includes(headerLocale as Locale)) {
        locale = headerLocale as Locale;
      }
    }

    // 3. Parse Accept-Language header
    if (!locale && req.headers['accept-language']) {
      const acceptLanguage = req.headers['accept-language'];
      const languages = this.parseAcceptLanguage(acceptLanguage);
      acceptedLanguages.push(...languages);

      // Find first supported locale
      for (const lang of languages) {
        const matchedLocale = this.matchLocale(lang);
        if (matchedLocale) {
          locale = matchedLocale;
          break;
        }
      }
    }

    // 4. Check user preference (if authenticated)
    if (!locale && (req as any).user?.preferredLocale) {
      const userLocale = (req as any).user.preferredLocale;
      if (this.supportedLocales.includes(userLocale)) {
        locale = userLocale;
      }
    }

    // Set locale on request object
    req.locale = locale;
    req.acceptedLanguages = acceptedLanguages;

    // Set Content-Language header
    res.setHeader('Content-Language', locale);

    next();
  }

  private parseAcceptLanguage(acceptLanguage: string): string[] {
    // Parse Accept-Language header and return ordered list of languages
    // Example: "en-US,en;q=0.9,es;q=0.8" -> ['en-US', 'en', 'es']
    const languages: Array<{ lang: string; q: number }> = [];

    acceptLanguage.split(',').forEach((item) => {
      const [lang, qValue] = item.trim().split(';');
      const q = qValue ? parseFloat(qValue.split('=')[1]) : 1.0;
      languages.push({ lang: lang.trim(), q });
    });

    // Sort by quality value (q)
    languages.sort((a, b) => b.q - a.q);

    return languages.map((item) => item.lang);
  }

  private matchLocale(lang: string): Locale | null {
    // Direct match
    if (this.supportedLocales.includes(lang as Locale)) {
      return lang as Locale;
    }

    // Match language code (e.g., 'en-US' -> 'en')
    const langCode = lang.split('-')[0].toLowerCase();

    // Special case for Portuguese
    if (lang.toLowerCase().startsWith('pt-br')) {
      return 'pt-BR';
    }

    // Match by language code
    if (langCode === 'es') return 'es';
    if (langCode === 'en') return 'en';
    if (langCode === 'pt') return 'pt-BR';

    return null;
  }

  static getLocale(req: Request): Locale {
    return (req as LocalizedRequest).locale || 'es';
  }

  static getAcceptedLanguages(req: Request): string[] {
    return (req as LocalizedRequest).acceptedLanguages || [];
  }
}
