import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { CurrencyService } from '../currency.service';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockExchangeRate = {
    id: 'test-id',
    baseCurrency: Currency.USD,
    targetCurrency: Currency.EUR,
    rate: new Decimal(0.92),
    source: 'openexchangerates',
    validFrom: new Date(),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOpenExchangeResponse: AxiosResponse = {
    data: {
      disclaimer: 'Usage subject to terms',
      license: 'https://openexchangerates.org/license',
      timestamp: Math.floor(Date.now() / 1000),
      base: 'USD',
      rates: {
        EUR: 0.92,
        MXN: 17.5,
        GBP: 0.79,
        BRL: 5.1,
        CAD: 1.37,
      },
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        {
          provide: PrismaService,
          useValue: {
            exchangeRate: {
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
            },
            geoSession: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            keys: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRate', () => {
    it('should return 1 for same currency', async () => {
      const rate = await service.getRate(Currency.USD, Currency.USD);
      expect(rate).toBe(1);
    });

    it('should return cached rate if available', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue('0.92');

      const rate = await service.getRate(Currency.USD, Currency.EUR);

      expect(rate).toBe(0.92);
      expect(redisService.get).toHaveBeenCalledWith('rate:USD-EUR');
      expect(prismaService.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(prismaService.exchangeRate, 'findFirst').mockResolvedValue(mockExchangeRate);

      const rate = await service.getRate(Currency.USD, Currency.EUR);

      expect(rate).toBe(0.92);
      expect(prismaService.exchangeRate.findFirst).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalledWith('rate:USD-EUR', '0.92', 3600);
    });

    it('should calculate inverse rate if direct rate not found', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(prismaService.exchangeRate, 'findFirst')
        .mockResolvedValueOnce(null) // Direct rate not found
        .mockResolvedValueOnce({
          ...mockExchangeRate,
          baseCurrency: Currency.EUR,
          targetCurrency: Currency.USD,
          rate: new Decimal(1.087),
        }); // Inverse rate found

      const rate = await service.getRate(Currency.USD, Currency.EUR);

      expect(rate).toBeCloseTo(0.92, 2);
    });

    it('should calculate cross rate through USD', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(prismaService.exchangeRate, 'findFirst')
        .mockResolvedValueOnce(null) // Direct EUR-MXN not found
        .mockResolvedValueOnce(null) // Inverse MXN-EUR not found
        .mockResolvedValueOnce({
          ...mockExchangeRate,
          baseCurrency: Currency.EUR,
          targetCurrency: Currency.USD,
          rate: new Decimal(1.087),
        }) // EUR-USD found
        .mockResolvedValueOnce({
          ...mockExchangeRate,
          baseCurrency: Currency.USD,
          targetCurrency: Currency.MXN,
          rate: new Decimal(17.5),
        }); // USD-MXN found

      const rate = await service.getRate(Currency.EUR, Currency.MXN);

      expect(rate).toBeCloseTo(19.02, 1);
    });

    it('should use fallback rates if database fails', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(prismaService.exchangeRate, 'findFirst').mockRejectedValue(new Error('DB Error'));

      const rate = await service.getRate(Currency.USD, Currency.EUR);

      expect(rate).toBe(0.92); // Fallback rate
    });

    it('should handle historical rate requests', async () => {
      const historicalDate = new Date('2024-01-15');
      jest.spyOn(prismaService.exchangeRate, 'findFirst').mockResolvedValue(mockExchangeRate);

      await service.getRate(Currency.USD, Currency.EUR, historicalDate);

      expect(prismaService.exchangeRate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            validFrom: { lte: historicalDate },
            validUntil: { gte: historicalDate },
          }),
        }),
      );
      // Should not cache historical rates
      expect(redisService.set).not.toHaveBeenCalled();
    });
  });

  describe('convert', () => {
    it('should convert currency amount correctly', async () => {
      jest.spyOn(service, 'getRate').mockResolvedValue(0.92);

      const result = await service.convert(100, Currency.USD, Currency.EUR);

      expect(result).toMatchObject({
        originalAmount: 100,
        originalCurrency: Currency.USD,
        convertedAmount: 92,
        convertedCurrency: Currency.EUR,
        rate: 0.92,
        inverseRate: 1.087,
      });
    });

    it('should apply fees when configured', async () => {
      jest.spyOn(service, 'getRate').mockResolvedValue(0.92);

      const result = await service.convert(100, Currency.USD, Currency.EUR, {
        includeFees: true,
      });

      expect(result.fees).toBeDefined();
      expect(result.fees?.percentage).toBe(0.5); // 0.5% of 100
      expect(result.fees?.fixed).toBe(0.3); // USD fixed fee
      expect(result.fees?.total).toBe(0.8);
      expect(result.convertedAmount).toBe(91.26); // 92 - 0.8 fees, rounded
    });

    it('should apply rounding mode', async () => {
      jest.spyOn(service, 'getRate').mockResolvedValue(0.923456);

      const floorResult = await service.convert(100, Currency.USD, Currency.EUR, {
        roundingMode: 'floor',
      });
      expect(floorResult.convertedAmount).toBe(92.34);

      const ceilResult = await service.convert(100, Currency.USD, Currency.EUR, {
        roundingMode: 'ceil',
      });
      expect(ceilResult.convertedAmount).toBe(92.35);

      const roundResult = await service.convert(100, Currency.USD, Currency.EUR, {
        roundingMode: 'round',
      });
      expect(roundResult.convertedAmount).toBe(92.35);
    });

    it('should handle conversion errors', async () => {
      jest.spyOn(service, 'getRate').mockRejectedValue(new Error('Rate fetch failed'));

      await expect(service.convert(100, Currency.USD, Currency.EUR)).rejects.toThrow(
        'Currency conversion failed',
      );
    });

    it('should handle JPY rounding (no decimals)', async () => {
      jest.spyOn(service, 'getRate').mockResolvedValue(149.567);

      const result = await service.convert(100, Currency.USD, Currency.JPY);

      expect(result.convertedAmount).toBe(14957); // Should round to whole number
    });
  });

  describe('updateExchangeRates', () => {
    it('should fetch and save exchange rates', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockOpenExchangeResponse));
      jest.spyOn(prismaService.exchangeRate, 'create').mockResolvedValue(mockExchangeRate);
      jest.spyOn(prismaService.exchangeRate, 'findFirst').mockResolvedValue(null);

      await service.updateExchangeRates();

      expect(httpService.get).toHaveBeenCalledWith(
        'https://openexchangerates.org/api/latest.json',
        expect.objectContaining({
          params: {
            app_id: 'test-api-key',
            base: 'USD',
          },
        }),
      );

      expect(prismaService.exchangeRate.create).toHaveBeenCalledTimes(5); // For each rate in mock response
    });

    it('should detect large rate changes', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockOpenExchangeResponse));
      jest.spyOn(prismaService.exchangeRate, 'findFirst').mockResolvedValue({
        ...mockExchangeRate,
        rate: new Decimal(0.8), // Previous rate was 0.8, new is 0.92 (15% change)
      });
      jest.spyOn(prismaService.exchangeRate, 'create').mockResolvedValue(mockExchangeRate);

      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

      await service.updateExchangeRates();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Large rate change detected'),
      );
    });

    it('should skip update if API key not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);

      await service.updateExchangeRates();

      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('API Error')));

      await service.updateExchangeRates();

      expect(prismaService.exchangeRate.create).not.toHaveBeenCalled();
    });

    it('should skip duplicate rate entries', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-api-key');
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockOpenExchangeResponse));
      jest
        .spyOn(prismaService.exchangeRate, 'create')
        .mockRejectedValue(new Error('Unique constraint failed'));

      await service.updateExchangeRates();

      // Should complete without throwing
      expect(prismaService.exchangeRate.create).toHaveBeenCalled();
    });
  });

  describe('getExchangeRates', () => {
    it('should return rates for all currencies', async () => {
      jest.spyOn(service, 'getRate').mockImplementation(async (base, target) => {
        if (base === target) return 1;
        if (target === Currency.EUR) return 0.92;
        if (target === Currency.MXN) return 17.5;
        return 1;
      });

      const result = await service.getExchangeRates(Currency.USD);

      expect(result).toMatchObject({
        base: Currency.USD,
        rates: expect.objectContaining({
          [Currency.USD]: 1,
          [Currency.EUR]: 0.92,
          [Currency.MXN]: 17.5,
        }),
        source: 'cotiza-studio',
      });
    });

    it('should handle different base currencies', async () => {
      jest.spyOn(service, 'getRate').mockImplementation(async (base, target) => {
        if (base === target) return 1;
        if (base === Currency.EUR && target === Currency.USD) return 1.087;
        if (base === Currency.EUR && target === Currency.MXN) return 19.02;
        return 1;
      });

      const result = await service.getExchangeRates(Currency.EUR);

      expect(result.base).toBe(Currency.EUR);
      expect(result.rates[Currency.EUR]).toBe(1);
    });
  });

  describe('getConversionAnalytics', () => {
    it('should return conversion analytics', async () => {
      const mockSessions = [
        { detectedCurrency: Currency.USD },
        { detectedCurrency: Currency.USD },
        { detectedCurrency: Currency.EUR },
        { detectedCurrency: Currency.MXN },
        { detectedCurrency: null },
      ];

      jest.spyOn(prismaService.geoSession, 'findMany').mockResolvedValue(mockSessions as any);

      const result = await service.getConversionAnalytics(30);

      expect(result).toMatchObject({
        totalConversions: 5,
        topCurrencyPairs: expect.any(Array),
        totalVolume: expect.any(Array),
        averageConversionAmount: 850,
      });

      expect(result.topCurrencyPairs[0]).toMatchObject({
        from: Currency.USD,
        to: expect.any(String),
        count: 2,
      });
    });

    it('should handle empty analytics data', async () => {
      jest.spyOn(prismaService.geoSession, 'findMany').mockResolvedValue([]);

      const result = await service.getConversionAnalytics(30);

      expect(result.totalConversions).toBe(0);
      expect(result.topCurrencyPairs).toEqual([]);
    });
  });

  describe('forceRateUpdate', () => {
    it('should force exchange rate update', async () => {
      jest.spyOn(service, 'updateExchangeRates').mockResolvedValue();

      const result = await service.forceRateUpdate();

      expect(result).toMatchObject({
        success: true,
        message: 'Exchange rates updated successfully',
      });
      expect(service.updateExchangeRates).toHaveBeenCalled();
    });

    it('should handle update failures', async () => {
      jest.spyOn(service, 'updateExchangeRates').mockRejectedValue(new Error('Update failed'));

      const result = await service.forceRateUpdate();

      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('Rate update failed'),
      });
    });
  });

  describe('helper methods', () => {
    it('should return supported currencies', () => {
      const currencies = service.getSupportedCurrencies();

      expect(currencies).toContain(Currency.USD);
      expect(currencies).toContain(Currency.EUR);
      expect(currencies).toContain(Currency.MXN);
      expect(currencies.length).toBeGreaterThan(20);
    });

    it('should validate currency codes', () => {
      expect(service.isValidCurrency('USD')).toBe(true);
      expect(service.isValidCurrency('EUR')).toBe(true);
      expect(service.isValidCurrency('INVALID')).toBe(false);
    });
  });
});
