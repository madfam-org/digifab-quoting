# Multicurrency & Geo-Detection Implementation Checklist

## 🎯 Project Overview

Implement comprehensive multicurrency support and automatic geo-detection for Cotiza Studio to enable international expansion and improve user experience.

**Target Timeline:** 6 weeks  
**Effort Estimate:** 2-3 developers  
**Status:** Ready to Begin

---

## 📋 Phase 1: Foundation & Infrastructure (Week 1-2)

### Week 1: Database & Core Services

#### Database Schema Updates

- [ ] **Update Currency enum in schema.prisma**

  ```prisma
  enum Currency {
    MXN USD EUR BRL GBP CAD CNY JPY ARS CLP COP PEN
    CHF SEK NOK DKK PLN KRW INR SGD HKD AUD NZD TWD
    THB AED SAR ZAR EGP
  }
  ```

  - [ ] Add 24+ international currencies
  - [ ] Test enum values match shared types
  - [ ] Update existing Quote model references

- [ ] **Add ExchangeRate model**

  ```prisma
  model ExchangeRate {
    id             String   @id @default(cuid())
    baseCurrency   Currency
    targetCurrency Currency
    rate           Decimal  @db.Decimal(12, 6)
    source         String
    validFrom      DateTime
    validUntil     DateTime
    createdAt      DateTime @default(now())
  }
  ```

  - [ ] Create model with proper indexes
  - [ ] Add unique constraints
  - [ ] Test decimal precision for rates

- [ ] **Add UserPreferences model**

  ```prisma
  model UserPreferences {
    id                String   @id @default(cuid())
    userId            String   @unique
    preferredLocale   String   @default("es")
    preferredCurrency Currency @default(MXN)
    timezone          String?
    autoDetect        Boolean  @default(true)
    createdAt         DateTime @default(now())
    updatedAt         DateTime @updatedAt

    user User @relation(fields: [userId], references: [id])
  }
  ```

  - [ ] Link to User model
  - [ ] Add proper defaults
  - [ ] Test cascade deletes

- [ ] **Add GeoSession model**

  ```prisma
  model GeoSession {
    id               String    @id @default(cuid())
    sessionId        String    @unique
    ipAddress        String
    country          String?
    city             String?
    region           String?
    timezone         String?
    detectedLocale   String?
    detectedCurrency Currency?
    selectedLocale   String?
    selectedCurrency Currency?
    userAgent        String?
    createdAt        DateTime  @default(now())
    updatedAt        DateTime  @updatedAt
  }
  ```

  - [ ] Add session tracking
  - [ ] Include geo detection results
  - [ ] Add proper indexes

- [ ] **Update Quote model for multicurrency**

  ```prisma
  model Quote {
    // ... existing fields
    currency       Currency @default(MXN)
    exchangeRate   Decimal? @db.Decimal(12, 6)
    baseCurrency   Currency?
    // ... rest of fields
  }
  ```

  - [ ] Add exchange rate locking
  - [ ] Support currency conversion
  - [ ] Maintain backward compatibility

- [ ] **Run database migration**
  ```bash
  npx prisma db push
  npx prisma generate
  ```
  - [ ] Backup production data
  - [ ] Test migration on staging
  - [ ] Verify all models work correctly

#### Environment Configuration

- [ ] **Add environment variables**

  ```bash
  # Exchange Rates
  OPENEXCHANGE_APP_ID=your_api_key
  OPENEXCHANGE_BASE_URL=https://openexchangerates.org/api

  # IP Geolocation
  IPINFO_TOKEN=your_token
  IPINFO_BASE_URL=https://ipinfo.io

  # Feature Flags
  ENABLE_GEO_DETECTION=true
  ENABLE_MULTI_CURRENCY=true
  SUPPORTED_CURRENCIES=MXN,USD,EUR,BRL,GBP,CAD
  DEFAULT_CURRENCY=MXN
  DEFAULT_LOCALE=es

  # Caching
  GEO_CACHE_TTL=86400
  RATES_CACHE_TTL=3600
  ```

  - [ ] Add to all environment files (.env, .env.example, etc.)
  - [ ] Document all variables
  - [ ] Set up production secrets

- [ ] **External API Setup**
  - [ ] Sign up for OpenExchangeRates (Free: 1000 req/month)
  - [ ] Sign up for IPinfo.io (Free: 50k req/month)
  - [ ] Test API access with sample requests
  - [ ] Configure rate limiting and error handling

### Week 2: Backend Services

#### Geo-Detection Service

- [ ] **Create GeoService**
  ```typescript
  // apps/api/src/modules/geo/geo.service.ts
  @Injectable()
  export class GeoService {
    async detectFromRequest(req: Request): Promise<GeoDetection>;
    async detectFromIP(ip: string): Promise<GeoDetection>;
    private mapCountryToGeo(countryCode: string): GeoMapping;
    private getClientIp(req: Request): string;
    private fetchGeoData(ip: string): Promise<GeoDetection>;
  }
  ```
  - [ ] Implement edge header detection (Vercel/CloudFlare)
  - [ ] Add IP geolocation API fallback
  - [ ] Include browser detection support
  - [ ] Add caching with Redis (24h TTL)
  - [ ] Handle edge cases (VPNs, proxies, etc.)

#### Currency Service

- [ ] **Create CurrencyService**
  ```typescript
  // apps/api/src/modules/geo/currency.service.ts
  @Injectable()
  export class CurrencyService {
    async getRate(from: Currency, to: Currency, date?: Date): Promise<number>;
    async convert(amount: number, from: Currency, to: Currency): Promise<ConversionResult>;
    async updateExchangeRates(): Promise<void>;
    private roundByCurrency(amount: number, currency: Currency): number;
    private calculateFees(amount: number, from: Currency, to: Currency): FeeCalculation;
  }
  ```
  - [ ] Integrate OpenExchangeRates API
  - [ ] Implement rate caching (1 hour TTL)
  - [ ] Add currency-specific rounding rules
  - [ ] Include fee calculation logic
  - [ ] Set up scheduled rate updates (every 6 hours)
  - [ ] Add rate validation and alerts

#### API Controllers

- [ ] **Create GeoController**

  ```typescript
  // apps/api/src/modules/geo/geo.controller.ts
  @Controller('api/v1/geo')
  export class GeoController {
    @Get('detect')
    async detectLocation(@Req() req: Request): Promise<GeoDetectionResponse>

    @Post('preferences')
    async updatePreferences(@Body() prefs: UpdatePreferencesRequest): Promise<void>
  }
  ```

  - [ ] Implement geo-detection endpoint
  - [ ] Add user preferences management
  - [ ] Include proper validation and error handling
  - [ ] Add rate limiting (100 req/min per IP)

- [ ] **Create CurrencyController**

  ```typescript
  // apps/api/src/modules/geo/currency.controller.ts
  @Controller('api/v1/currency')
  export class CurrencyController {
    @Get('rates')
    async getExchangeRates(@Query() query: ExchangeRatesRequest): Promise<ExchangeRatesResponse>

    @Post('convert')
    async convertCurrency(@Body() request: CurrencyConversionRequest): Promise<CurrencyConversionResponse>
  }
  ```

  - [ ] Implement exchange rates endpoint
  - [ ] Add currency conversion endpoint
  - [ ] Include historical rates support
  - [ ] Add proper caching headers

#### Module Integration

- [ ] **Create GeoModule**
  ```typescript
  // apps/api/src/modules/geo/geo.module.ts
  @Module({
    imports: [HttpModule, ConfigModule, RedisModule, PrismaModule],
    controllers: [GeoController, CurrencyController],
    providers: [GeoService, CurrencyService],
    exports: [GeoService, CurrencyService],
  })
  export class GeoModule {}
  ```
  - [ ] Set up module dependencies
  - [ ] Export services for other modules
  - [ ] Add to main app module

---

## 📱 Phase 2: Frontend Integration (Week 2-3)

### Shared Types Update

- [x] **Enhanced geo.ts types** - Already Created
  - [x] Extended Currency enum with 24+ currencies
  - [x] GeoDetection interface with confidence scoring
  - [x] UserPreferences interface
  - [x] Currency formatting utilities

### React Hooks

- [x] **useGeoDetection hook** - Already Created

  ```typescript
  // apps/web/src/hooks/useGeoDetection.ts
  export function useGeoDetection(): UseGeoDetectionReturn {
    // Automatic geo-detection with caching
    // User preference management
    // Error handling and fallbacks
  }
  ```

  - [x] Automatic location detection
  - [x] Browser cache integration (24h)
  - [x] User preference persistence
  - [x] Error handling with defaults

- [x] **useCurrency hook** - Already Created
  ```typescript
  // apps/web/src/hooks/useCurrency.ts
  export function useCurrency(): UseCurrencyReturn {
    // Currency management
    // Exchange rate fetching
    // Conversion utilities
    // Formatting functions
  }
  ```
  - [x] Real-time exchange rates
  - [x] Currency conversion with caching
  - [x] Locale-aware formatting
  - [x] Comprehensive error handling

### UI Components

- [ ] **Currency Selector Component**

  ```tsx
  // apps/web/src/components/currency/CurrencySelector.tsx
  interface CurrencySelectorProps {
    value: Currency;
    onChange: (currency: Currency) => void;
    supportedCurrencies?: Currency[];
    showFlags?: boolean;
    showRates?: boolean;
    disabled?: boolean;
  }
  ```

  - [ ] Dropdown with flag icons
  - [ ] Real-time exchange rates display
  - [ ] Search/filter functionality
  - [ ] Responsive design for mobile

- [ ] **Price Display Component**

  ```tsx
  // apps/web/src/components/currency/PriceDisplay.tsx
  interface PriceDisplayProps {
    amount: number;
    currency?: Currency;
    showAlternatives?: boolean;
    convertFrom?: Currency;
    showExchangeRate?: boolean;
    precision?: number;
  }
  ```

  - [ ] Formatted price display with proper symbols
  - [ ] Alternative currency options
  - [ ] Exchange rate information
  - [ ] Loading states and error handling

- [ ] **Currency Converter Widget**
  ```tsx
  // apps/web/src/components/currency/CurrencyConverter.tsx
  interface CurrencyConverterProps {
    initialAmount?: number;
    fromCurrency?: Currency;
    toCurrency?: Currency;
    onConvert?: (result: ConversionResult) => void;
  }
  ```
  - [ ] Interactive currency conversion
  - [ ] Real-time rate updates
  - [ ] Historical rate charts (optional)
  - [ ] Copy/share functionality

### Integration Points

- [ ] **Update Navbar with Currency Selector**

  ```tsx
  // apps/web/src/components/layout/navbar.tsx
  // Add currency selector next to language switcher
  ```

  - [ ] Integrate currency selector
  - [ ] Maintain session state
  - [ ] Update user preferences

- [ ] **Update LanguageSwitcher Integration**

  ```tsx
  // apps/web/src/components/LanguageSwitcher.tsx
  // Coordinate with geo-detection
  ```

  - [ ] Sync with geo-detection results
  - [ ] Maintain user override preferences
  - [ ] Handle conflicts gracefully

- [ ] **Update useTranslation Hook**
  ```typescript
  // apps/web/src/hooks/useTranslation.ts
  // Integrate with geo-detection
  ```
  - [ ] Use geo-detected locale as default
  - [ ] Respect user preferences
  - [ ] Maintain existing functionality

---

## 💰 Phase 3: Quote System Integration (Week 3-4)

### Quote Creation Flow

- [ ] **Update Quote Creation Page**

  ```tsx
  // apps/web/src/app/quote/new/page.tsx
  // Add currency selection at start of flow
  ```

  - [ ] Currency selector at quote initialization
  - [ ] Real-time price updates on currency change
  - [ ] Exchange rate display and locking
  - [ ] User preference persistence

- [ ] **Update Quote Item Components**

  ```tsx
  // apps/web/src/components/quote/QuoteItemsList.tsx
  // Display prices in selected currency
  ```

  - [ ] Multi-currency price display
  - [ ] Alternative currency options
  - [ ] Exchange rate information
  - [ ] Conversion animations

- [ ] **Update Quote Display Page**
  ```tsx
  // apps/web/src/app/quote/[id]/page.tsx
  // Show quote in multiple currencies
  ```
  - [ ] Primary currency display
  - [ ] Alternative currency calculator
  - [ ] Exchange rate used at creation
  - [ ] Rate change notifications

### Pricing Engine Updates

- [ ] **Update Pricing Engine**

  ```typescript
  // packages/pricing-engine/src/engine.ts
  // Add multi-currency support
  ```

  - [ ] Currency-aware calculations
  - [ ] Exchange rate integration
  - [ ] Multi-currency output format
  - [ ] Rate locking functionality

- [ ] **Update Quote Service**
  ```typescript
  // apps/api/src/modules/quotes/quotes.service.ts
  // Integrate currency conversion
  ```
  - [ ] Currency selection support
  - [ ] Exchange rate storage
  - [ ] Multi-currency quote display
  - [ ] Historical rate tracking

### Payment Integration

- [ ] **Update Payment Service**
  ```typescript
  // apps/api/src/modules/payment/payment.service.ts
  // Multi-currency payment support
  ```
  - [ ] Currency-specific payment methods
  - [ ] Real-time conversion at checkout
  - [ ] Multi-currency Stripe integration
  - [ ] Receipt generation with rates

---

## 🧪 Phase 4: Testing & Quality Assurance (Week 4-5)

### Unit Tests

- [ ] **Currency Service Tests**

  ```typescript
  // apps/api/src/modules/geo/currency.service.spec.ts
  describe('CurrencyService', () => {
    it('should convert currency accurately');
    it('should handle rate API failures');
    it('should apply correct rounding rules');
    it('should cache rates properly');
  });
  ```

  - [ ] Conversion accuracy tests
  - [ ] Rounding rule validation
  - [ ] Cache behavior verification
  - [ ] Error handling scenarios

- [ ] **Geo Service Tests**

  ```typescript
  // apps/api/src/modules/geo/geo.service.spec.ts
  describe('GeoService', () => {
    it('should detect location from headers');
    it('should fallback to IP geolocation');
    it('should handle VPN/proxy scenarios');
    it('should cache detection results');
  });
  ```

  - [ ] Multi-source detection logic
  - [ ] Fallback mechanism tests
  - [ ] Edge case handling
  - [ ] Cache integration tests

- [ ] **Frontend Hook Tests**
  ```typescript
  // apps/web/src/hooks/__tests__/useCurrency.test.ts
  // apps/web/src/hooks/__tests__/useGeoDetection.test.ts
  ```
  - [ ] Hook state management
  - [ ] API integration testing
  - [ ] Error handling verification
  - [ ] Cache behavior validation

### Integration Tests

- [ ] **End-to-End Quote Flow**

  ```typescript
  // tests/e2e/multicurrency-quote.spec.ts
  test('should create quote with currency selection', async () => {
    // Test complete flow from geo-detection to quote creation
  });
  ```

  - [ ] Geo-detection → currency selection → quote creation
  - [ ] Currency switching during quote process
  - [ ] Multi-currency quote display
  - [ ] Payment with currency conversion

- [ ] **API Integration Tests**
  ```typescript
  // tests/integration/geo-api.spec.ts
  // tests/integration/currency-api.spec.ts
  ```
  - [ ] External API integration (OpenExchangeRates, IPinfo)
  - [ ] Rate limiting behavior
  - [ ] Error handling and fallbacks
  - [ ] Cache invalidation scenarios

### Performance Tests

- [ ] **Load Testing**

  ```typescript
  // tests/performance/currency-load.spec.ts
  ```

  - [ ] Concurrent currency conversions
  - [ ] High-volume rate updates
  - [ ] Cache performance under load
  - [ ] Database query optimization

- [ ] **Browser Performance**
  - [ ] Page load impact measurement
  - [ ] Bundle size analysis
  - [ ] Runtime performance profiling
  - [ ] Mobile device testing

---

## 🚀 Phase 5: Deployment & Monitoring (Week 5-6)

### Feature Flag Setup

- [ ] **Configure Feature Flags**
  ```typescript
  // apps/web/src/lib/feature-flags.ts
  export const featureFlags = {
    enableGeoDetection: process.env.NEXT_PUBLIC_ENABLE_GEO_DETECTION === 'true',
    enableMultiCurrency: process.env.NEXT_PUBLIC_ENABLE_MULTI_CURRENCY === 'true',
    supportedCurrencies: process.env.NEXT_PUBLIC_SUPPORTED_CURRENCIES?.split(',') || ['MXN'],
    defaultCurrency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'MXN',
  };
  ```
  - [ ] Environment-based configuration
  - [ ] Gradual rollout capability
  - [ ] A/B testing support
  - [ ] Quick rollback mechanism

### Deployment Strategy

- [ ] **Staging Deployment**

  - [ ] Deploy to staging environment
  - [ ] Test with real external APIs
  - [ ] Validate performance metrics
  - [ ] User acceptance testing

- [ ] **Production Rollout**
  ```bash
  # Gradual rollout plan:
  # Week 1: 10% traffic
  # Week 2: 25% traffic
  # Week 3: 50% traffic
  # Week 4: 100% traffic
  ```
  - [ ] 10% traffic rollout
  - [ ] Monitor error rates and performance
  - [ ] Gradually increase to 100%
  - [ ] Rollback plan ready

### Monitoring & Analytics

- [ ] **Key Metrics Dashboard**

  ```typescript
  // Metrics to track:
  - Geo-detection accuracy rate
  - Currency conversion volume
  - Most used currency pairs
  - API response times
  - Cache hit rates
  - User preference overrides
  ```

  - [ ] Set up monitoring dashboards
  - [ ] Configure alerts for key metrics
  - [ ] Track business impact metrics
  - [ ] Monitor external API health

- [ ] **Error Monitoring**
  - [ ] Exchange rate API failures
  - [ ] Unusual rate movements (>5% change)
  - [ ] High error rates on geo-detection
  - [ ] Performance degradation alerts
  - [ ] Cache service health checks

### Documentation

- [ ] **API Documentation**

  - [ ] Update OpenAPI 3.0 specification
  - [ ] Create Postman collection
  - [ ] Add integration examples
  - [ ] Document rate limiting

- [ ] **User Documentation**
  - [ ] Currency selection guide
  - [ ] Exchange rate explanation
  - [ ] Privacy policy updates
  - [ ] FAQ for common issues

---

## 📊 Success Metrics & KPIs

### Technical Metrics

- [ ] **Performance Targets**

  - Geo-detection response time: < 200ms (p95)
  - Currency conversion response time: < 100ms (p95)
  - Cache hit rate: > 90%
  - API availability: > 99.9%

- [ ] **Accuracy Targets**
  - Geo-detection accuracy: > 95%
  - Currency display accuracy: 99.9%
  - Rate freshness: < 1 hour old
  - User preference persistence: 100%

### Business Metrics

- [ ] **Conversion Improvements**

  - International user conversion: +15%
  - Quote abandonment reduction: -20%
  - Support ticket reduction: -30%
  - User satisfaction increase: +10%

- [ ] **Usage Analytics**
  - Currency selection patterns
  - Geo-detection override rates
  - Most popular currency pairs
  - Regional usage distribution

---

## 🔄 Maintenance & Future Enhancements

### Ongoing Maintenance

- [ ] **Regular Updates**

  - Weekly exchange rate accuracy validation
  - Monthly geo-detection accuracy review
  - Quarterly external API evaluation
  - Annual currency support expansion

- [ ] **Performance Optimization**
  - Cache optimization based on usage patterns
  - Database query performance tuning
  - Bundle size optimization
  - CDN configuration for global performance

### Future Enhancements (Post-Launch)

- [ ] **Advanced Features**

  - Historical rate charts and analytics
  - Rate change notifications and alerts
  - Bulk currency conversion tools
  - Advanced geo-targeting options

- [ ] **International Expansion**
  - Additional currency support
  - Region-specific payment methods
  - Local tax calculation integration
  - Multi-timezone scheduling support

---

## 🚨 Risk Mitigation

### Technical Risks

- [ ] **External API Dependencies**

  - Multiple provider fallbacks configured
  - Cached rates for offline scenarios
  - Rate limit handling and queuing
  - Automatic failover mechanisms

- [ ] **Performance Risks**
  - Comprehensive caching strategy
  - Database query optimization
  - Bundle size monitoring
  - CDN and edge optimization

### Business Risks

- [ ] **User Experience**

  - Gradual rollout with monitoring
  - Clear UI/UX for currency selection
  - Comprehensive error messages
  - Easy rollback mechanism

- [ ] **Compliance & Legal**
  - GDPR compliance for EU users
  - Privacy policy updates
  - Data retention policies
  - Audit trail maintenance

---

## ✅ Final Checklist

### Pre-Launch Validation

- [ ] All unit tests passing (>95% coverage)
- [ ] Integration tests validated
- [ ] Performance benchmarks met
- [ ] Security scan completed
- [ ] Documentation up to date

### Launch Readiness

- [ ] Feature flags configured
- [ ] Monitoring dashboards active
- [ ] Alert systems tested
- [ ] Rollback procedure documented
- [ ] Team training completed

### Post-Launch

- [ ] Monitor key metrics for 48 hours
- [ ] User feedback collection active
- [ ] Support team briefed on new features
- [ ] Success metrics tracking enabled

---

**🎯 Ready for Implementation!**

This comprehensive checklist provides a complete roadmap for implementing the multicurrency and geo-detection system. Each task is broken down into actionable items with clear deliverables and success criteria.

**Next Step:** Begin with Phase 1 database schema updates and external API setup.
