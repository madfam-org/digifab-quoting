import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { firstValueFrom } from 'rxjs';
import { Decimal } from '@prisma/client/runtime/library';
import { Currency, ConversionResult, ConversionOptions, CURRENCY_CONFIG } from '@cotiza/shared';

export interface ExchangeRatesResponse {
  base: Currency;
  date: string;
  rates: Record<Currency, number>;
  source: string;
  updatedAt: string;
}

interface OpenExchangeRatesResponse {
  disclaimer: string;
  license: string;
  timestamp: number;
  base: string;
  rates: Record<string, number>;
}

interface FeeCalculation {
  percentage: number;
  fixed: number;
  total: number;
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly cachePrefix = 'rate:';
  private readonly cacheTTL = 3600; // 1 hour
  private readonly maxRateChange = 0.1; // 10% max daily change alert threshold

  // Fallback rates (USD base) - updated occasionally
  private readonly fallbackRates: Record<Currency, number> = {
    [Currency.USD]: 1,
    [Currency.MXN]: 17.5,
    [Currency.EUR]: 0.92,
    [Currency.BRL]: 5.1,
    [Currency.GBP]: 0.79,
    [Currency.CAD]: 1.37,
    [Currency.CNY]: 7.25,
    [Currency.JPY]: 149,
    [Currency.ARS]: 365,
    [Currency.CLP]: 920,
    [Currency.COP]: 4100,
    [Currency.PEN]: 3.75,
    [Currency.CHF]: 0.91,
    [Currency.SEK]: 10.9,
    [Currency.NOK]: 11.2,
    [Currency.DKK]: 6.87,
    [Currency.PLN]: 4.35,
    [Currency.KRW]: 1320,
    [Currency.INR]: 83.1,
    [Currency.SGD]: 1.36,
    [Currency.HKD]: 7.81,
    [Currency.AUD]: 1.53,
    [Currency.NZD]: 1.67,
    [Currency.TWD]: 32,
    [Currency.THB]: 36,
    [Currency.AED]: 3.67,
    [Currency.SAR]: 3.75,
    [Currency.ZAR]: 18.5,
    [Currency.EGP]: 30.9,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Initialize rate updates on service start
    this.updateExchangeRates().catch((error) =>
      this.logger.error('Failed to initialize exchange rates:', error),
    );
  }

  /**
   * Get exchange rate between two currencies
   */
  async getRate(from: Currency, to: Currency, date?: Date): Promise<number> {
    if (from === to) return 1;

    // Check cache first (unless requesting historical rate)
    if (!date) {
      const cacheKey = `${this.cachePrefix}${from}-${to}`;
      const cached = await this.redis.get(cacheKey);
      if (cached && typeof cached === 'string') {
        return parseFloat(cached);
      }
    }

    try {
      // Try to get from database first
      const dbRate = await this.getRateFromDB(from, to, date);
      if (dbRate) {
        // Cache current rates for 1 hour
        if (!date) {
          const cacheKey = `${this.cachePrefix}${from}-${to}`;
          await this.redis.set(cacheKey, dbRate.toString(), this.cacheTTL);
        }
        return dbRate;
      }

      // Fallback to calculation using USD as base
      const rate = this.calculateRateFromFallback(from, to);

      this.logger.warn(`Using fallback rate for ${from}-${to}: ${rate}`);

      return rate;
    } catch (error) {
      this.logger.error(`Failed to get rate for ${from}-${to}:`, error);
      return this.calculateRateFromFallback(from, to);
    }
  }

  /**
   * Convert currency amount
   */
  async convert(
    amount: number,
    from: Currency,
    to: Currency,
    options?: ConversionOptions,
  ): Promise<ConversionResult> {
    try {
      const rate = await this.getRate(from, to, options?.date);

      // Apply fees (denominated in the source currency) before converting so
      // the deduction stays dimensionally consistent — subtracting a source
      // currency fee from the already-converted target amount is incorrect.
      let netAmount = amount;
      let fees: FeeCalculation | undefined;
      if (options?.includeFees) {
        fees = this.calculateFees(amount, from, to);
        netAmount -= fees.total;
      }

      let convertedAmount = netAmount * rate;

      // Apply rounding rules per currency
      convertedAmount = this.roundByCurrency(convertedAmount, to, options?.roundingMode);

      return {
        originalAmount: amount,
        originalCurrency: from,
        convertedAmount,
        convertedCurrency: to,
        rate,
        inverseRate: 1 / rate,
        fees,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Currency conversion failed (${amount} ${from} to ${to}):`, error);
      throw new Error(`Currency conversion failed: ${error.message}`);
    }
  }

  /**
   * Get current exchange rates for a base currency
   */
  async getExchangeRates(base: Currency = Currency.USD): Promise<ExchangeRatesResponse> {
    try {
      const rates = {} as Record<Currency, number>;

      // Get rates for all supported currencies
      const currencies = Object.values(Currency);

      for (const currency of currencies) {
        if (currency === base) {
          rates[currency] = 1;
        } else {
          rates[currency] = await this.getRate(base, currency);
        }
      }

      return {
        base,
        date: new Date().toISOString().split('T')[0],
        rates,
        source: 'cotiza-studio',
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get exchange rates for base ${base}:`, error);
      throw error;
    }
  }

  /**
   * Update exchange rates from external provider (scheduled task)
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async updateExchangeRates(): Promise<void> {
    try {
      const apiKey = this.configService.get<string>('OPENEXCHANGE_APP_ID');
      if (!apiKey) {
        this.logger.warn('OPENEXCHANGE_APP_ID not configured, skipping rate update');
        return;
      }

      this.logger.log('Starting exchange rate update...');

      const response = await firstValueFrom(
        this.httpService.get<OpenExchangeRatesResponse>(
          'https://openexchangerates.org/api/latest.json',
          {
            params: {
              app_id: apiKey,
              base: 'USD',
            },
            timeout: 10000, // 10 second timeout
          },
        ),
      );

      const data = response.data;
      const timestamp = new Date(data.timestamp * 1000);
      const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // Valid for 24 hours

      let updatedCount = 0;
      let alertCount = 0;

      // Process each rate
      for (const [currencyCode, rate] of Object.entries(data.rates)) {
        if (this.isSupportedCurrency(currencyCode)) {
          const currency = currencyCode as Currency;

          // Check for unusual rate changes
          const previousRate = await this.getLatestRateFromDB(Currency.USD, currency);
          if (previousRate) {
            const change = Math.abs((rate - previousRate) / previousRate);
            if (change > this.maxRateChange) {
              this.logger.warn(
                `Large rate change detected for ${currency}: ${previousRate} -> ${rate} (${Math.round(change * 100)}%)`,
              );
              alertCount++;
            }
          }

          try {
            await this.prisma.exchangeRate.create({
              data: {
                baseCurrency: Currency.USD,
                targetCurrency: currency,
                rate: new Decimal(rate),
                source: 'openexchangerates',
                validFrom: timestamp,
                validUntil,
              },
            });

            updatedCount++;
          } catch (error) {
            // Skip if already exists (unique constraint)
            if (!error.message?.includes('Unique constraint')) {
              this.logger.error(`Failed to save rate for ${currency}:`, error);
            }
          }
        }
      }

      // Invalidate cache to force fresh rates (simplified approach)
      // Note: Redis keys pattern matching would require custom implementation
      // For now, we'll let cache expire naturally with TTL

      this.logger.log(
        `Exchange rate update completed: ${updatedCount} rates updated, ${alertCount} alerts generated`,
      );
    } catch (error) {
      this.logger.error('Failed to update exchange rates:', error);

      // Don't throw error to prevent service disruption
      // Fallback rates will be used automatically
    }
  }

  /**
   * Get rate from database
   */
  private async getRateFromDB(from: Currency, to: Currency, date?: Date): Promise<number | null> {
    try {
      const targetDate = date || new Date();

      // Direct rate lookup
      let rate = await this.prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: from,
          targetCurrency: to,
          validFrom: { lte: targetDate },
          validUntil: { gte: targetDate },
        },
        orderBy: { validFrom: 'desc' },
      });

      if (rate) {
        return rate.rate.toNumber();
      }

      // Inverse rate lookup
      rate = await this.prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: to,
          targetCurrency: from,
          validFrom: { lte: targetDate },
          validUntil: { gte: targetDate },
        },
        orderBy: { validFrom: 'desc' },
      });

      if (rate) {
        return 1 / rate.rate.toNumber();
      }

      // Cross-rate calculation through USD
      if (from !== Currency.USD && to !== Currency.USD) {
        const fromToUsd = await this.getRateFromDB(from, Currency.USD, date);
        const usdToTarget = await this.getRateFromDB(Currency.USD, to, date);

        if (fromToUsd && usdToTarget) {
          return fromToUsd * usdToTarget;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Database rate lookup failed for ${from}-${to}:`, error);
      return null;
    }
  }

  /**
   * Get latest rate from database (for change detection)
   */
  private async getLatestRateFromDB(from: Currency, to: Currency): Promise<number | null> {
    try {
      const rate = await this.prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: from,
          targetCurrency: to,
        },
        orderBy: { createdAt: 'desc' },
      });

      return rate ? rate.rate.toNumber() : null;
    } catch (error) {
      this.logger.error(`Failed to get latest rate for ${from}-${to}:`, error);
      return null;
    }
  }

  /**
   * Calculate rate from fallback rates
   */
  private calculateRateFromFallback(from: Currency, to: Currency): number {
    if (from === to) return 1;

    const fromRate = this.fallbackRates[from];
    const toRate = this.fallbackRates[to];

    if (!fromRate || !toRate) {
      this.logger.error(`Missing fallback rate for ${from} or ${to}`);
      return 1; // Return 1:1 as last resort
    }

    // Convert through USD: from -> USD -> to
    return toRate / fromRate;
  }

  /**
   * Round amount according to currency rules
   */
  private roundByCurrency(
    amount: number,
    currency: Currency,
    mode: 'floor' | 'ceil' | 'round' = 'round',
  ): number {
    const config = CURRENCY_CONFIG[currency];
    // Use nullish coalescing: zero-decimal currencies (JPY, CLP, COP) set
    // decimals: 0, which `|| 2` would incorrectly override with 2.
    const decimals = config?.decimals ?? 2;
    const multiplier = Math.pow(10, decimals);

    switch (mode) {
      case 'floor':
        return Math.floor(amount * multiplier) / multiplier;
      case 'ceil':
        return Math.ceil(amount * multiplier) / multiplier;
      case 'round':
      default:
        return Math.round(amount * multiplier) / multiplier;
    }
  }

  /**
   * Calculate conversion fees (placeholder implementation)
   */
  private calculateFees(amount: number, from: Currency, _to: Currency): FeeCalculation {
    // Basic fee structure (can be made configurable)
    const percentageFee = 0.005; // 0.5%
    const fixedFee = from === Currency.USD ? 0.3 : 0; // $0.30 for USD transactions

    const percentageAmount = amount * percentageFee;
    const total = percentageAmount + fixedFee;

    return {
      percentage: Math.round(percentageAmount * 100) / 100,
      fixed: fixedFee,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Check if currency is supported
   */
  private isSupportedCurrency(code: string): boolean {
    return Object.values(Currency).includes(code as Currency);
  }

  /**
   * Get currency conversion analytics
   */
  async getConversionAnalytics(days: number = 30): Promise<{
    totalConversions: number;
    topCurrencyPairs: { from: Currency; to: Currency; count: number }[];
    totalVolume: { currency: Currency; amount: number }[];
    averageConversionAmount: number;
  }> {
    try {
      // This would typically track actual conversion requests
      // For now, return placeholder analytics based on geo sessions
      const since = new Date();
      since.setDate(since.getDate() - days);

      const sessions = await this.prisma.geoSession.findMany({
        where: { createdAt: { gte: since } },
        select: { detectedCurrency: true },
      });

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
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      // Mock conversion pairs (would be real data in production)
      const topCurrencyPairs = topCurrencies.map(([currency, count], index) => ({
        from: currency as Currency,
        to: index % 2 === 0 ? Currency.USD : Currency.MXN,
        count,
      }));

      const totalVolume = topCurrencies.map(([currency, count]) => ({
        currency: currency as Currency,
        amount: count * 1000, // Mock volume
      }));

      return {
        totalConversions: sessions.length,
        topCurrencyPairs,
        totalVolume,
        averageConversionAmount: 850, // Mock average
      };
    } catch (error) {
      this.logger.error('Failed to get conversion analytics:', error);
      throw error;
    }
  }

  /**
   * Force rate refresh (admin function)
   */
  async forceRateUpdate(): Promise<{ success: boolean; message: string }> {
    try {
      await this.updateExchangeRates();
      return {
        success: true,
        message: 'Exchange rates updated successfully',
      };
    } catch (error) {
      this.logger.error('Force rate update failed:', error);
      return {
        success: false,
        message: `Rate update failed: ${error.message}`,
      };
    }
  }

  /**
   * Get supported currencies list
   */
  getSupportedCurrencies(): Currency[] {
    return Object.values(Currency);
  }

  /**
   * Validate currency code
   */
  isValidCurrency(code: string): code is Currency {
    return this.isSupportedCurrency(code);
  }
}
