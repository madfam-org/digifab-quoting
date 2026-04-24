import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GeoService } from './geo.service';
import { CurrencyService } from './currency.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { Role } from '@/common/enums';
// import { OptionalJwtAuthGuard } from '@/modules/auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { GeoDetection, Currency, ConversionResult, ConversionOptions } from '@cotiza/shared';

// DTOs for API validation
class UpdatePreferencesDto {
  locale?: string;
  currency?: Currency;
  timezone?: string;
  autoDetect?: boolean;
  currencyDisplayMode?: 'symbol' | 'code' | 'name';
}

class ConvertCurrencyDto {
  amount: number;
  from: Currency;
  to: Currency;
  date?: string;
  includeFees?: boolean;
  roundingMode?: 'floor' | 'ceil' | 'round';
}

class ExchangeRatesQuery {
  base?: Currency;
  targets?: string; // Comma-separated currency codes
  date?: string;
}

@ApiTags('geo')
@Controller('api/v1/geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('detect')
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  // @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Detect user location and preferences',
    description:
      'Automatically detect user location, currency, and language preferences using IP geolocation and browser headers',
  })
  @ApiResponse({
    status: 200,
    description: 'Geo detection successful',
    schema: {
      type: 'object',
      properties: {
        detected: {
          type: 'object',
          properties: {
            country: { type: 'string' },
            countryCode: { type: 'string' },
            city: { type: 'string' },
            timezone: { type: 'string' },
            locale: { type: 'string' },
            currency: { type: 'string' },
            confidence: { type: 'number' },
            source: { type: 'string' },
          },
        },
        recommended: {
          type: 'object',
          properties: {
            locale: { type: 'string' },
            currency: { type: 'string' },
            alternativeLocales: { type: 'array', items: { type: 'string' } },
            alternativeCurrencies: { type: 'array', items: { type: 'string' } },
          },
        },
        userPreferences: {
          type: 'object',
          nullable: true,
          properties: {
            locale: { type: 'string' },
            currency: { type: 'string' },
            timezone: { type: 'string' },
            autoDetect: { type: 'boolean' },
            currencyDisplayMode: { type: 'string' },
          },
        },
      },
    },
  })
  async detectLocation(
    @Req() req: Request,
    @CurrentUser() user?: { id: string },
  ): Promise<GeoDetection> {
    const detection = await this.geoService.detectFromRequest(req);

    // Add user preferences if authenticated
    if (user) {
      const preferences = await this.geoService.getUserPreferences(user.id);
      if (preferences) {
        detection.userPreferences = preferences;
      }
    }

    return detection;
  }

  @Post('preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update user geo preferences',
    description: 'Update user preferences for currency, locale, and auto-detection settings',
  })
  @ApiResponse({ status: 204, description: 'Preferences updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatePreferences(
    @Body() preferences: UpdatePreferencesDto,
    @CurrentUser() user: { id: string },
  ): Promise<void> {
    await this.geoService.updateUserPreferences(user.id, preferences);
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get geo analytics',
    description: 'Get geographic analytics and usage statistics (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getAnalytics(@Query('days') days?: string) {
    const dayCount = days ? parseInt(days) : 30;
    return this.geoService.getGeoAnalytics(dayCount);
  }
}

@ApiTags('currency')
@Controller('api/v1/currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get('rates')
  @Throttle({ default: { limit: 1000, ttl: 3600000 } }) // 1000 requests per hour
  @ApiOperation({
    summary: 'Get current exchange rates',
    description: 'Get current exchange rates for all supported currencies',
  })
  @ApiResponse({
    status: 200,
    description: 'Exchange rates retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        base: { type: 'string' },
        date: { type: 'string' },
        rates: { type: 'object' },
        source: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
  })
  async getExchangeRates(@Query() query: ExchangeRatesQuery) {
    const base = query.base || Currency.USD;
    const rates = await this.currencyService.getExchangeRates(base);

    // Filter to specific targets if requested
    if (query.targets) {
      const targetCurrencies = query.targets.split(',').map((c) => c.trim().toUpperCase());
      const filteredRates: Partial<Record<Currency, number>> = {};

      for (const target of targetCurrencies) {
        if (this.currencyService.isValidCurrency(target) && rates.rates[target as Currency]) {
          filteredRates[target as Currency] = rates.rates[target as Currency];
        }
      }

      rates.rates = filteredRates as Record<Currency, number>;
    }

    return rates;
  }

  @Post('convert')
  @Throttle({ default: { limit: 500, ttl: 3600000 } }) // 500 conversions per hour
  @ApiOperation({
    summary: 'Convert currency amount',
    description: 'Convert amount between currencies with optional fees and rounding',
  })
  @ApiResponse({
    status: 200,
    description: 'Currency converted successfully',
    schema: {
      type: 'object',
      properties: {
        originalAmount: { type: 'number' },
        originalCurrency: { type: 'string' },
        convertedAmount: { type: 'number' },
        convertedCurrency: { type: 'string' },
        rate: { type: 'number' },
        inverseRate: { type: 'number' },
        fees: {
          type: 'object',
          nullable: true,
          properties: {
            percentage: { type: 'number' },
            fixed: { type: 'number' },
            total: { type: 'number' },
          },
        },
        timestamp: { type: 'string' },
      },
    },
  })
  async convertCurrency(@Body() dto: ConvertCurrencyDto): Promise<ConversionResult> {
    const options: ConversionOptions = {
      date: dto.date ? new Date(dto.date) : undefined,
      includeFees: dto.includeFees,
      roundingMode: dto.roundingMode,
    };

    return this.currencyService.convert(dto.amount, dto.from, dto.to, options);
  }

  @Get('supported')
  @ApiOperation({
    summary: 'Get supported currencies',
    description: 'Get list of all supported currencies',
  })
  @ApiResponse({
    status: 200,
    description: 'Supported currencies retrieved',
    schema: {
      type: 'object',
      properties: {
        currencies: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  getSupportedCurrencies() {
    return {
      currencies: this.currencyService.getSupportedCurrencies(),
    };
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get currency analytics',
    description: 'Get currency conversion analytics (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getCurrencyAnalytics(@Query('days') days?: string) {
    const dayCount = days ? parseInt(days) : 30;
    return this.currencyService.getConversionAnalytics(dayCount);
  }

  @Post('admin/refresh-rates')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Force refresh exchange rates',
    description: 'Manually trigger exchange rate update (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Rate refresh initiated' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async forceRateRefresh(@CurrentUser() _user: { id: string; roles: string[] }) {
    return this.currencyService.forceRateUpdate();
  }
}
