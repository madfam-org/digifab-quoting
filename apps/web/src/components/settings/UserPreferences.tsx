'use client';

import { useState, useEffect } from 'react';
import { Save, RefreshCw, MapPin, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CurrencySelector, CurrencyBadge } from '@/components/currency/CurrencySelector';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrency } from '@/hooks/useCurrency';
import { Currency, Locale, GeoDetection } from '@cotiza/shared';

interface UserPreferencesProps {
  userId?: string;
  showGeoDetection?: boolean;
  onSave?: (preferences: UserPreferencesData) => void;
  className?: string;
}

interface UserPreferencesData {
  locale: Locale;
  currency: Currency;
  timezone: string;
  autoDetect: boolean;
  currencyDisplayMode: 'symbol' | 'code' | 'name';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  privacy: {
    shareLocationData: boolean;
    shareUsageAnalytics: boolean;
  };
}

interface GeoDetectionData {
  detected: {
    country: string;
    countryCode: string;
    city: string;
    timezone: string;
    locale: Locale;
    currency: Currency;
    confidence: number;
    source: string;
  };
  recommended: {
    locale: Locale;
    currency: Currency;
    alternativeLocales: Locale[];
    alternativeCurrencies: Currency[];
  };
}

const TIMEZONES = [
  'America/Mexico_City',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const CURRENCY_DISPLAY_MODES = [
  { value: 'symbol', label: 'Symbol ($, €, £)' },
  { value: 'code', label: 'Code (USD, EUR, GBP)' },
  { value: 'name', label: 'Full name (US Dollar, Euro)' },
] as const;

export function UserPreferences({
  userId,
  showGeoDetection = true,
  onSave,
  className = '',
}: UserPreferencesProps) {
  const { t, locale, changeLanguage } = useTranslation();
  const { currency, setCurrency } = useCurrency();

  const [, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectingGeo, setDetectingGeo] = useState(false);
  const [geoData, setGeoData] = useState<GeoDetectionData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [preferences, setPreferences] = useState<UserPreferencesData>({
    locale: locale as Locale,
    currency: currency,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    autoDetect: true,
    currencyDisplayMode: 'symbol',
    notifications: {
      email: true,
      push: false,
      sms: false,
    },
    privacy: {
      shareLocationData: false,
      shareUsageAnalytics: true,
    },
  });

  // Load user preferences
  useEffect(() => {
    if (userId) {
      setLoading(true);
      // TODO: Load from API
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    }
  }, [userId]);

  // Track changes
  useEffect(() => {
    setHasChanges(
      preferences.locale !== locale ||
        preferences.currency !== currency ||
        preferences.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  }, [preferences, locale, currency]);

  const handleGeoDetection = async () => {
    setDetectingGeo(true);
    try {
      const response = await fetch('/api/v1/geo/detect', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data: GeoDetection = await response.json();
        setGeoData(data as GeoDetectionData);

        // Auto-apply high-confidence detections
        if (data.detected.confidence > 0.8) {
          setPreferences((prev) => ({
            ...prev,
            locale: data.detected.locale as Locale,
            currency: data.detected.currency,
            timezone: data.detected.timezone,
          }));
        }
      }
    } catch (error) {
      console.error('Geo detection failed:', error);
    } finally {
      setDetectingGeo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update local state first
      changeLanguage(preferences.locale);
      await setCurrency(preferences.currency);

      // Save to backend if user is authenticated
      if (userId && onSave) {
        await onSave(preferences);
      }

      // TODO: Save to localStorage for guest users
      localStorage.setItem('userPreferences', JSON.stringify(preferences));

      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyGeoRecommendation = (type: 'locale' | 'currency') => {
    if (!geoData) return;

    if (type === 'locale') {
      setPreferences((prev) => ({
        ...prev,
        locale: geoData.recommended.locale as Locale,
      }));
    } else if (type === 'currency') {
      setPreferences((prev) => ({
        ...prev,
        currency: geoData.recommended.currency,
      }));
    }
  };

  const renderGeoDetection = () => {
    if (!showGeoDetection) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t('settings.geoDetection')}
          </CardTitle>
          <CardDescription>{t('settings.geoDetectionDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGeoDetection} disabled={detectingGeo} className="w-full">
            {detectingGeo ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.detecting')}
              </>
            ) : (
              <>
                <Globe2 className="mr-2 h-4 w-4" />
                {t('settings.detectLocation')}
              </>
            )}
          </Button>

          {geoData && (
            <div className="space-y-4">
              <Alert>
                <AlertDescription className="space-y-2">
                  <div className="font-medium">
                    {t('settings.detectedLocation')}: {geoData.detected.city},{' '}
                    {geoData.detected.country}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={geoData.detected.confidence > 0.8 ? 'default' : 'secondary'}>
                      {Math.round(geoData.detected.confidence * 100)}% {t('settings.confidence')}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {t('settings.source')}: {geoData.detected.source}
                    </span>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.recommendedLanguage')}</Label>
                    <div className="text-sm text-muted-foreground">
                      {geoData.recommended.locale}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyGeoRecommendation('locale')}
                  >
                    {t('settings.apply')}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.recommendedCurrency')}</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <CurrencyBadge currency={geoData.recommended.currency} />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyGeoRecommendation('currency')}
                  >
                    {t('settings.apply')}
                  </Button>
                </div>

                {geoData.recommended.alternativeCurrencies.length > 0 && (
                  <div>
                    <Label className="text-sm text-muted-foreground">
                      {t('settings.alternativeCurrencies')}
                    </Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {geoData.recommended.alternativeCurrencies.slice(0, 3).map((curr) => (
                        <CurrencyBadge key={curr} currency={curr} className="text-xs" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Geo Detection */}
      {renderGeoDetection()}

      {/* Language & Currency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" />
            {t('settings.languageAndCurrency')}
          </CardTitle>
          <CardDescription>{t('settings.languageAndCurrencyDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="language">{t('settings.language')}</Label>
              <LanguageSwitcher />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t('settings.currency')}</Label>
              <CurrencySelector
                value={preferences.currency}
                onChange={(curr) => setPreferences((prev) => ({ ...prev, currency: curr }))}
                showRates={true}
                showTrends={true}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">{t('settings.timezone')}</Label>
            <Select
              value={preferences.timezone}
              onValueChange={(value) => setPreferences((prev) => ({ ...prev, timezone: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace('_', ' ')} (
                    {
                      Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'short' })
                        .formatToParts()
                        .find((part) => part.type === 'timeZoneName')?.value
                    }
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currencyDisplay">{t('settings.currencyDisplayMode')}</Label>
            <Select
              value={preferences.currencyDisplayMode}
              onValueChange={(value: 'symbol' | 'code' | 'name') =>
                setPreferences((prev) => ({ ...prev, currencyDisplayMode: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_DISPLAY_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('settings.autoDetect')}</Label>
              <div className="text-sm text-muted-foreground">
                {t('settings.autoDetectDescription')}
              </div>
            </div>
            <Switch
              checked={preferences.autoDetect}
              onCheckedChange={(checked: boolean) =>
                setPreferences((prev) => ({ ...prev, autoDetect: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.notifications')}</CardTitle>
          <CardDescription>{t('settings.notificationsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('settings.emailNotifications')}</Label>
              <div className="text-sm text-muted-foreground">
                {t('settings.emailNotificationsDescription')}
              </div>
            </div>
            <Switch
              checked={preferences.notifications.email}
              onCheckedChange={(checked: boolean) =>
                setPreferences((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, email: checked },
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('settings.pushNotifications')}</Label>
              <div className="text-sm text-muted-foreground">
                {t('settings.pushNotificationsDescription')}
              </div>
            </div>
            <Switch
              checked={preferences.notifications.push}
              onCheckedChange={(checked: boolean) =>
                setPreferences((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, push: checked },
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.privacy')}</CardTitle>
          <CardDescription>{t('settings.privacyDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('settings.shareLocationData')}</Label>
              <div className="text-sm text-muted-foreground">
                {t('settings.shareLocationDataDescription')}
              </div>
            </div>
            <Switch
              checked={preferences.privacy.shareLocationData}
              onCheckedChange={(checked: boolean) =>
                setPreferences((prev) => ({
                  ...prev,
                  privacy: { ...prev.privacy, shareLocationData: checked },
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('settings.shareUsageAnalytics')}</Label>
              <div className="text-sm text-muted-foreground">
                {t('settings.shareUsageAnalyticsDescription')}
              </div>
            </div>
            <Switch
              checked={preferences.privacy.shareUsageAnalytics}
              onCheckedChange={(checked: boolean) =>
                setPreferences((prev) => ({
                  ...prev,
                  privacy: { ...prev.privacy, shareUsageAnalytics: checked },
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4">
        <div className="text-sm text-muted-foreground">
          {hasChanges && t('settings.unsavedChanges')}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges} className="min-w-24">
          {saving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t('common.save')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
