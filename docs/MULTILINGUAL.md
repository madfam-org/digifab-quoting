# Multilingual Support Documentation

## Overview

Cotiza Studio provides comprehensive multilingual support across the entire platform, including the web interface, API responses, email communications, and generated PDFs.

## Supported Languages

- **Spanish (es)** - Default language
- **English (en)**
- **Portuguese - Brazil (pt-BR)**

## Architecture

### Frontend (Next.js)

#### Translation System

The frontend uses a custom translation hook that provides:

- Dynamic translation loading
- Local caching for performance
- Fallback to default locale
- Parameter interpolation
- Currency and date formatting

```typescript
import { useTranslation } from '@/hooks/useTranslation';

function Component() {
  const { t, locale, formatCurrency } = useTranslation('namespace');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('welcome', { name: 'John' })}</p>
      <span>{formatCurrency(100, 'MXN')}</span>
    </div>
  );
}
```

#### Locale Detection

The system detects the user's preferred language through:

1. URL path (e.g., `/es/`, `/en/`, `/pt-BR/`)
2. User account preference (stored in database)
3. Browser language settings
4. Default fallback (Spanish)

#### Translation Files

Translations are organized by namespace:

```
public/locales/
├── es/
│   ├── common.json      # UI elements
│   ├── errors.json      # Error messages
│   ├── features.json    # Feature descriptions
│   ├── personas.json    # User personas
│   └── seo.json        # SEO meta tags
├── en/
│   └── ...
└── pt-BR/
    └── ...
```

### Backend (NestJS)

#### I18n Service

The backend provides a comprehensive i18n service with:

- Redis caching for performance
- Database storage for dynamic content
- Static file loading
- Email template localization

```typescript
@Injectable()
export class I18nService {
  async translate(key: string, locale: Locale = 'es', params?: TranslationParams): Promise<string>;

  async translateEmail(
    templateKey: string,
    locale: Locale,
    params?: TranslationParams,
  ): Promise<{ subject: string; body: string }>;

  formatCurrency(amount: number, locale: Locale, currency?: string): string;
  formatDate(date: Date, locale: Locale): string;
}
```

#### Locale Middleware

Automatic locale detection for API requests:

```typescript
// Priority order:
1. Query parameter: ?locale=en
2. Custom header: X-Locale: en
3. Accept-Language header
4. User's stored preference
5. Default locale (es)
```

#### Database Schema

```prisma
model User {
  preferredLocale String @default("es")
  // ...
}

model Translation {
  id        String   @id
  key       String   // e.g., "errors.validation.required"
  locale    String   // e.g., "es", "en", "pt-BR"
  value     String   // The translated text
  namespace String   // Group translations
}
```

## Implementation Guide

### Adding a New Translation

1. **Frontend Component**:

```typescript
// 1. Add to translation file
// public/locales/es/features.json
{
  "newFeature": {
    "title": "Nueva Funcionalidad",
    "description": "Descripción de la funcionalidad"
  }
}

// 2. Use in component
const { t } = useTranslation('features');
return <h1>{t('newFeature.title')}</h1>;
```

2. **Backend API Response**:

```typescript
// In your service or controller
constructor(private i18n: I18nService) {}

async getResponse(locale: Locale) {
  return {
    message: await this.i18n.translate('success.message', locale),
    data: {...}
  };
}
```

3. **Email Template**:

```typescript
// Add to locales/es/emails.json
{
  "notification": {
    "newOrder": {
      "subject": "Nueva orden #{{orderNumber}}",
      "body": "<h1>Has recibido una nueva orden</h1>"
    }
  }
}

// Send email
await emailService.sendTemplate(
  'notification.newOrder',
  { to: user.email },
  { orderNumber: '12345' },
  user.preferredLocale
);
```

### Language Switcher Component

```typescript
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// In your layout
<LanguageSwitcher />
```

The component automatically:

- Displays current language
- Shows available languages with flags
- Updates URL on language change
- Persists preference to localStorage
- Updates user account preference (if logged in)

### SEO Considerations

#### Meta Tags

```typescript
import { SEOHead } from '@/components/SEOHead';

<SEOHead
  titleKey="page.title"
  descriptionKey="page.description"
  url="/quotes/new"
/>
```

Generates:

- Localized title and description
- hreflang alternate links
- Open Graph locale tags
- Structured data with language

#### URL Structure

```
https://www.cotiza.studio/es/        # Spanish
https://www.cotiza.studio/en/        # English
https://www.cotiza.studio/pt-BR/     # Portuguese
```

## API Usage

### Setting Locale for API Requests

#### Method 1: Query Parameter

```bash
curl https://api.cotiza.studio/v1/quotes?locale=en
```

#### Method 2: Custom Header

```bash
curl -H "X-Locale: en" https://api.cotiza.studio/v1/quotes
```

#### Method 3: Accept-Language Header

```bash
curl -H "Accept-Language: en-US,en;q=0.9" https://api.cotiza.studio/v1/quotes
```

### Response Example

```json
{
  "success": true,
  "message": "Quote created successfully", // Localized
  "data": {
    "id": "quote_123",
    "status": "draft",
    "statusLabel": "Draft", // Localized
    "total": 1000,
    "totalFormatted": "$1,000.00 MXN" // Localized formatting
  }
}
```

## Currency Formatting

### Supported Currencies

- **MXN** - Mexican Peso (default)
- **USD** - US Dollar
- **BRL** - Brazilian Real

### Usage

```typescript
// Frontend
const { formatCurrency } = useTranslation();
formatCurrency(1000, 'MXN'); // "$1,000.00 MXN"

// Backend
i18nService.formatCurrency(1000, 'es', 'MXN'); // "$1,000.00 MXN"
i18nService.formatCurrency(1000, 'en', 'USD'); // "$1,000.00"
i18nService.formatCurrency(1000, 'pt-BR', 'BRL'); // "R$ 1.000,00"
```

## Date Formatting

```typescript
// Frontend
const { formatDate } = useTranslation();
formatDate(new Date()); // "20/01/2024" (es)

// Backend
i18nService.formatDate(new Date(), 'es'); // "20/01/2024"
i18nService.formatDate(new Date(), 'en'); // "01/20/2024"
i18nService.formatDate(new Date(), 'pt-BR'); // "20/01/2024"
```

## Testing

### Unit Tests

```typescript
describe('I18nService', () => {
  it('should return Spanish translation by default', async () => {
    const result = await service.translate('common.welcome');
    expect(result).toBe('Bienvenido');
  });

  it('should return English translation when specified', async () => {
    const result = await service.translate('common.welcome', 'en');
    expect(result).toBe('Welcome');
  });

  it('should interpolate parameters', async () => {
    const result = await service.translate('common.greeting', 'es', { name: 'Juan' });
    expect(result).toBe('Hola, Juan');
  });
});
```

### E2E Tests

```typescript
test('should switch language', async ({ page }) => {
  await page.goto('/es');

  // Check Spanish content
  await expect(page.locator('h1')).toContainText('Bienvenido');

  // Switch to English
  await page.click('[data-testid="language-switcher"]');
  await page.click('[data-value="en"]');

  // Check English content
  await expect(page.locator('h1')).toContainText('Welcome');

  // Verify URL changed
  await expect(page).toHaveURL('/en');
});
```

## Performance

### Caching Strategy

1. **Frontend**:

   - In-memory cache for loaded translations
   - localStorage for user preference
   - Static file caching via Next.js

2. **Backend**:
   - Redis cache with 1-hour TTL
   - Database query optimization
   - Static file preloading on startup

### Bundle Optimization

- Translations are loaded on-demand per namespace
- Only active locale is loaded
- Lazy loading for large translation files

## Best Practices

1. **Translation Keys**:

   - Use descriptive, hierarchical keys
   - Group related translations
   - Avoid hardcoding text in components

2. **Placeholders**:

   - Use meaningful parameter names
   - Provide context for translators
   - Handle plural forms properly

3. **Testing**:

   - Test all locales in CI/CD
   - Verify parameter interpolation
   - Check date/currency formatting

4. **Maintenance**:
   - Keep translations synchronized
   - Use translation management tools
   - Regular review for consistency

## Troubleshooting

### Translation Not Showing

1. Check file exists: `/public/locales/{locale}/{namespace}.json`
2. Verify JSON syntax is valid
3. Clear browser cache
4. Check console for loading errors

### Wrong Locale Detected

1. Check URL path
2. Verify localStorage setting
3. Check user account preference
4. Review Accept-Language header

### Email in Wrong Language

1. Verify user.preferredLocale in database
2. Check email template exists
3. Review email service logs
4. Test with explicit locale parameter

## Future Enhancements

- [ ] Add more languages (French, German, Chinese)
- [ ] Implement plural forms handling
- [ ] Add translation management UI
- [ ] Integrate with translation services
- [ ] Add locale-specific number formatting
- [ ] Support for RTL languages
- [ ] Dynamic locale loading from CDN
- [ ] A/B testing for translations
