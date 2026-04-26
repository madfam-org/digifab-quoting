import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import {
  GeoDetection,
  Currency,
  GEO_MAPPINGS,
  getDefaultCurrencyForCountry,
  getDefaultLocaleForCountry,
} from '@cotiza/shared';

interface IPInfoResponse {
  ip: string;
  city?: string;
  region?: string;
  country: string;
  loc?: string; // latitude,longitude
  timezone?: string;
  postal?: string;
  org?: string;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cachePrefix = 'geo:';
  private readonly cacheTTL = 86400; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Detect geo information from HTTP request
   */
  async detectFromRequest(req: Request): Promise<GeoDetection> {
    const ip = this.getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    try {
      // 1. Try edge headers first (Vercel/CloudFlare)
      const edgeDetection = this.detectFromEdgeHeaders(req);
      if (edgeDetection.detected.confidence > 80) {
        this.logger.log(
          `High confidence geo detection from edge headers: ${edgeDetection.detected.country}`,
        );

        // Store in database for analytics
        await this.saveGeoSession({
          sessionId: this.generateSessionId(req),
          ipAddress: ip,
          ...edgeDetection.detected,
          userAgent,
        });

        return edgeDetection;
      }

      // 2. Try IP geolocation as fallback
      const ipDetection = await this.detectFromIP(ip);

      // Store in database
      await this.saveGeoSession({
        sessionId: this.generateSessionId(req),
        ipAddress: ip,
        ...ipDetection.detected,
        userAgent,
      });

      return ipDetection;
    } catch (error) {
      this.logger.error(`Geo detection failed for IP ${ip}:`, error);

      // Return defaults with browser detection if available
      const browserDetection = this.detectFromBrowser(req);
      const defaultDetection = this.getDefaultGeoDetection();

      return {
        ...defaultDetection,
        detected: {
          ...defaultDetection.detected,
          ...browserDetection,
          source: 'default',
          confidence: Math.max(browserDetection.confidence || 0, 0),
        },
      };
    }
  }

  /**
   * Detect from edge headers (Vercel/CloudFlare)
   */
  private detectFromEdgeHeaders(req: Request): GeoDetection {
    const countryCode = (req.headers['x-vercel-ip-country'] ||
      req.headers['cf-ipcountry'] ||
      req.headers['x-country-code']) as string;

    const city = (req.headers['x-vercel-ip-city'] || req.headers['cf-ipcity']) as string;

    const timezone = (req.headers['x-vercel-ip-timezone'] || req.headers['cf-timezone']) as string;

    if (countryCode && countryCode !== 'XX' && countryCode.length === 2) {
      const currency = getDefaultCurrencyForCountry(countryCode);
      const locale = getDefaultLocaleForCountry(countryCode);
      const geoMapping = GEO_MAPPINGS[countryCode.toUpperCase()];
      const country = geoMapping?.country || this.getCountryNameFromCode(countryCode);

      return {
        detected: {
          country,
          countryCode: countryCode.toUpperCase(),
          city: city ? decodeURIComponent(city) : undefined,
          timezone,
          locale,
          currency,
          confidence: 90, // High confidence for edge headers
          source: 'edge-header',
        },
        recommended: {
          locale,
          currency,
          alternativeLocales: ['es', 'en', 'pt-BR'].filter((l) => l !== locale),
          alternativeCurrencies: this.getAlternativeCurrencies(currency),
        },
      };
    }

    // Fallback to default if no valid edge headers
    return this.getDefaultGeoDetection();
  }

  /**
   * Detect from IP address using external service
   */
  async detectFromIP(ip: string): Promise<GeoDetection> {
    // Check cache first
    const cacheKey = `${this.cachePrefix}${ip}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached as string);
      } catch (error) {
        this.logger.warn(`Failed to parse cached geo data for IP ${ip}`);
      }
    }

    try {
      const ipinfoToken = this.configService.get<string>('IPINFO_TOKEN');
      if (!ipinfoToken) {
        this.logger.warn('IPINFO_TOKEN not configured, using defaults');
        return this.getDefaultGeoDetection();
      }

      const response = await firstValueFrom(
        this.httpService.get<IPInfoResponse>(`https://ipinfo.io/${ip}/json`, {
          headers: {
            Authorization: `Bearer ${ipinfoToken}`,
            Accept: 'application/json',
          },
          timeout: 5000, // 5 second timeout
        }),
      );

      const data = response.data;
      const countryCode = data.country;

      if (!countryCode || countryCode.length !== 2) {
        throw new Error('Invalid country code from IP service');
      }

      const currency = getDefaultCurrencyForCountry(countryCode);
      const locale = getDefaultLocaleForCountry(countryCode);
      const geoMapping = GEO_MAPPINGS[countryCode.toUpperCase()];
      const country = geoMapping?.country || this.getCountryNameFromCode(countryCode);

      const detection: GeoDetection = {
        detected: {
          country,
          countryCode: countryCode.toUpperCase(),
          city: data.city,
          region: data.region,
          timezone: data.timezone,
          locale,
          currency,
          confidence: 85, // Good confidence for IP service
          source: 'ip-service',
        },
        recommended: {
          locale,
          currency,
          alternativeLocales: ['es', 'en', 'pt-BR'].filter((l) => l !== locale),
          alternativeCurrencies: this.getAlternativeCurrencies(currency),
        },
      };

      // Cache for 24 hours
      await this.redis.set(cacheKey, JSON.stringify(detection), this.cacheTTL);

      return detection;
    } catch (error) {
      this.logger.error(`IP geolocation failed for ${ip}:`, error);
      return this.getDefaultGeoDetection();
    }
  }

  /**
   * Extract browser information from request headers
   */
  private detectFromBrowser(req: Request): Partial<GeoDetection['detected']> {
    const acceptLanguage = req.headers['accept-language'];
    let browserLocale = 'en';
    let confidence = 30; // Lower confidence for browser detection

    if (acceptLanguage) {
      // Parse Accept-Language header (e.g., "es-MX,es;q=0.9,en;q=0.8")
      const languages = acceptLanguage
        .split(',')
        .map((lang) => {
          const [code, q] = lang.trim().split(';q=');
          return {
            code: code.split('-')[0].toLowerCase(),
            quality: q ? parseFloat(q) : 1.0,
          };
        })
        .sort((a, b) => b.quality - a.quality);

      const primaryLang = languages[0]?.code;
      if (primaryLang) {
        if (primaryLang.startsWith('es')) {
          browserLocale = 'es';
          confidence = 50;
        } else if (primaryLang.startsWith('pt')) {
          browserLocale = 'pt-BR';
          confidence = 50;
        } else if (primaryLang.startsWith('en')) {
          browserLocale = 'en';
          confidence = 40;
        }
      }
    }

    const currency =
      browserLocale === 'es'
        ? Currency.MXN
        : browserLocale === 'pt-BR'
          ? Currency.BRL
          : Currency.USD;

    return {
      locale: browserLocale,
      currency,
      confidence,
      source: 'browser',
    };
  }

  /**
   * Get default geo detection (Mexico/Spanish/MXN)
   */
  private getDefaultGeoDetection(): GeoDetection {
    return {
      detected: {
        country: 'Mexico',
        countryCode: 'MX',
        timezone: 'America/Mexico_City',
        locale: 'es',
        currency: Currency.MXN,
        confidence: 0,
        source: 'default',
      },
      recommended: {
        locale: 'es',
        currency: Currency.MXN,
        alternativeLocales: ['en', 'pt-BR'],
        alternativeCurrencies: [Currency.USD, Currency.EUR, Currency.BRL],
      },
    };
  }

  /**
   * Get client IP from various headers
   */
  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-client-ip'] as string) ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      '127.0.0.1'
    );
  }

  /**
   * Generate session ID from request
   */
  private generateSessionId(req: Request): string {
    const ip = this.getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const timestamp = Math.floor(Date.now() / (1000 * 60 * 60)); // Hourly buckets

    // Simple hash function for session ID
    let hash = 0;
    const str = `${ip}-${userAgent}-${timestamp}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `sess_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Save geo session to database
   */
  private async saveGeoSession(data: {
    sessionId: string;
    ipAddress: string;
    country?: string;
    countryCode?: string;
    city?: string;
    region?: string;
    timezone?: string;
    locale?: string;
    currency?: Currency;
    confidence?: number;
    source?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.geoSession.upsert({
        where: { sessionId: data.sessionId },
        create: {
          sessionId: data.sessionId,
          ipAddress: data.ipAddress,
          country: data.country,
          countryCode: data.countryCode,
          city: data.city,
          region: data.region,
          timezone: data.timezone,
          detectedLocale: data.locale,
          detectedCurrency: data.currency,
          confidence: data.confidence,
          source: data.source,
          userAgent: data.userAgent,
        },
        update: {
          country: data.country,
          countryCode: data.countryCode,
          city: data.city,
          region: data.region,
          timezone: data.timezone,
          detectedLocale: data.locale,
          detectedCurrency: data.currency,
          confidence: data.confidence,
          source: data.source,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to save geo session:', error);
      // Don't throw error, as this is not critical for geo detection
    }
  }

  /**
   * Get user preferences by user ID
   */
  async getUserPreferences(userId: string): Promise<GeoDetection['userPreferences'] | null> {
    try {
      const preferences = await this.prisma.userPreferences.findUnique({
        where: { userId },
      });

      if (!preferences) return null;

      return {
        locale: preferences.preferredLocale,
        currency: preferences.preferredCurrency as Currency,
        timezone: preferences.timezone || undefined,
        autoDetect: preferences.autoDetect,
        currencyDisplayMode: preferences.currencyDisplayMode as 'symbol' | 'code' | 'name',
      };
    } catch (error) {
      this.logger.error(`Failed to get user preferences for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: string,
    preferences: Partial<GeoDetection['userPreferences']>,
  ): Promise<void> {
    try {
      await this.prisma.userPreferences.upsert({
        where: { userId },
        create: {
          userId,
          preferredLocale: preferences?.locale || 'es',
          preferredCurrency: preferences?.currency || Currency.MXN,
          timezone: preferences?.timezone,
          autoDetect: preferences?.autoDetect !== false,
          currencyDisplayMode: preferences?.currencyDisplayMode || 'symbol',
        },
        update: {
          preferredLocale: preferences?.locale,
          preferredCurrency: preferences?.currency,
          timezone: preferences?.timezone,
          autoDetect: preferences?.autoDetect,
          currencyDisplayMode: preferences?.currencyDisplayMode,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Updated user preferences for ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to update user preferences for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get alternative currencies for a given currency
   */
  private getAlternativeCurrencies(currency: Currency): Currency[] {
    const alternatives = [
      Currency.USD,
      Currency.EUR,
      Currency.MXN,
      Currency.BRL,
      Currency.GBP,
      Currency.CAD,
    ];
    return alternatives.filter((c) => c !== currency).slice(0, 4); // Return top 4 alternatives
  }

  /**
   * Get country name from country code (fallback)
   */
  private getCountryNameFromCode(code: string): string {
    const countryNames: Record<string, string> = {
      US: 'United States',
      MX: 'Mexico',
      CA: 'Canada',
      BR: 'Brazil',
      ES: 'Spain',
      GB: 'United Kingdom',
      FR: 'France',
      DE: 'Germany',
      IT: 'Italy',
      JP: 'Japan',
      CN: 'China',
      IN: 'India',
      AU: 'Australia',
      NZ: 'New Zealand',
      // Add more as needed
    };

    return countryNames[code.toUpperCase()] || code;
  }

  /**
   * Get geo analytics for admin dashboard
   */
  async getGeoAnalytics(days: number = 30): Promise<{
    totalSessions: number;
    topCountries: { country: string; count: number; percentage: number }[];
    topCurrencies: { currency: Currency; count: number; percentage: number }[];
    sourceBreakdown: { source: string; count: number; percentage: number }[];
    averageConfidence: number;
  }> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const sessions = await this.prisma.geoSession.findMany({
        where: {
          createdAt: { gte: since },
        },
        select: {
          country: true,
          detectedCurrency: true,
          source: true,
          confidence: true,
        },
      });

      const total = sessions.length;
      if (total === 0) {
        return {
          totalSessions: 0,
          topCountries: [],
          topCurrencies: [],
          sourceBreakdown: [],
          averageConfidence: 0,
        };
      }

      // Country breakdown
      const countryCount = sessions.reduce(
        (acc, session) => {
          if (session.country) {
            acc[session.country] = (acc[session.country] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      );

      const topCountries = Object.entries(countryCount)
        .map(([country, count]) => ({
          country,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Currency breakdown
      const currencyCount = sessions.reduce(
        (acc, session) => {
          if (session.detectedCurrency) {
            acc[session.detectedCurrency] = (acc[session.detectedCurrency] || 0) + 1;
          }
          return acc;
        },
        {} as Record<Currency, number>,
      );

      const topCurrencies = Object.entries(currencyCount)
        .map(([currency, count]) => ({
          currency: currency as Currency,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      // Source breakdown
      const sourceCount = sessions.reduce(
        (acc, session) => {
          if (session.source) {
            acc[session.source] = (acc[session.source] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      );

      const sourceBreakdown = Object.entries(sourceCount)
        .map(([source, count]) => ({
          source,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      // Average confidence
      const totalConfidence = sessions.reduce((sum, session) => sum + (session.confidence || 0), 0);
      const averageConfidence = Math.round(totalConfidence / total);

      return {
        totalSessions: total,
        topCountries,
        topCurrencies,
        sourceBreakdown,
        averageConfidence,
      };
    } catch (error) {
      this.logger.error('Failed to get geo analytics:', error);
      throw error;
    }
  }
}
