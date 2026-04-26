'use client';

import { useState, useEffect, useCallback } from 'react';
import { Currency, Locale, GeoDetection, UserPreferences } from '@cotiza/shared';

interface UseGeoDetectionReturn {
  geoData: GeoDetection | null;
  loading: boolean;
  error: string | null;
  currency: Currency;
  locale: Locale;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  refresh: () => Promise<void>;
}

const GEO_CACHE_KEY = 'cotiza-geo-detection';
const PREFERENCES_CACHE_KEY = 'cotiza-user-preferences';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function useGeoDetection(): UseGeoDetectionReturn {
  const [geoData, setGeoData] = useState<GeoDetection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getDefaultGeoData = (): GeoDetection => ({
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
      alternativeCurrencies: [Currency.USD, Currency.EUR],
    },
  });

  const detectFromBrowser = (): Partial<GeoDetection['detected']> => {
    if (typeof window === 'undefined') return {};

    try {
      const browserLang = navigator.language || 'en';
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      let locale: Locale = 'en';
      let currency: Currency = Currency.USD;

      // Map browser language to our supported locales
      if (browserLang.startsWith('es')) {
        locale = 'es';
        currency = Currency.MXN;
      } else if (browserLang.startsWith('pt')) {
        locale = 'pt-BR';
        currency = Currency.BRL;
      }

      return {
        timezone,
        locale,
        currency,
        source: 'browser' as const,
        confidence: 30, // Lower confidence for browser detection
      };
    } catch {
      return {};
    }
  };

  const loadFromCache = (): GeoDetection | null => {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(GEO_CACHE_KEY);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      const now = Date.now();

      if (now - parsed.timestamp > CACHE_DURATION) {
        localStorage.removeItem(GEO_CACHE_KEY);
        return null;
      }

      return parsed.data;
    } catch {
      localStorage.removeItem(GEO_CACHE_KEY);
      return null;
    }
  };

  const saveToCache = (data: GeoDetection): void => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(
        GEO_CACHE_KEY,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      console.warn('Failed to cache geo data:', error);
    }
  };

  const loadUserPreferences = (): UserPreferences | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(PREFERENCES_CACHE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const saveUserPreferences = (prefs: UserPreferences): void => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('Failed to save user preferences:', error);
    }
  };

  const fetchGeoDetection = async (): Promise<GeoDetection> => {
    try {
      const response = await fetch('/api/v1/geo/detect', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (fetchError) {
      console.warn('API geo-detection failed, using fallback:', fetchError);

      // Fallback to browser detection + defaults
      const browserData = detectFromBrowser();
      const defaultData = getDefaultGeoData();

      return {
        ...defaultData,
        detected: {
          ...defaultData.detected,
          ...browserData,
          source: browserData.source || 'default',
          confidence: browserData.confidence || 0,
        },
      };
    }
  };

  const detectGeo = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // 1. Check cache first
      const cached = loadFromCache();
      if (cached) {
        // Load user preferences
        const userPrefs = loadUserPreferences();
        if (userPrefs) {
          cached.userPreferences = userPrefs;
        }

        setGeoData(cached);
        setLoading(false);
        return;
      }

      // 2. Fetch from API or fallback
      const data = await fetchGeoDetection();

      // 3. Load user preferences
      const userPrefs = loadUserPreferences();
      if (userPrefs) {
        data.userPreferences = userPrefs;
      }

      // 4. Cache and set state
      saveToCache(data);
      setGeoData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to detect location';
      setError(errorMessage);

      // Use defaults on error
      const defaultData = getDefaultGeoData();
      const userPrefs = loadUserPreferences();
      if (userPrefs) {
        defaultData.userPreferences = userPrefs;
      }

      setGeoData(defaultData);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = useCallback(
    async (prefs: Partial<UserPreferences>): Promise<void> => {
      try {
        // Update user preferences locally
        const currentPrefs = geoData?.userPreferences || {
          locale: geoData?.recommended.locale || 'es',
          currency: geoData?.recommended.currency || Currency.MXN,
          autoDetect: true,
        };

        const newPrefs = { ...currentPrefs, ...prefs };

        // Save locally
        saveUserPreferences(newPrefs);

        // Update state
        setGeoData((prev) =>
          prev
            ? {
                ...prev,
                userPreferences: newPrefs,
              }
            : null,
        );

        // Try to save to API (fire and forget for now)
        try {
          await fetch('/api/v1/geo/preferences', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(prefs),
          });
        } catch (apiError) {
          console.warn('Failed to sync preferences to server:', apiError);
          // Continue anyway, local storage is our source of truth for now
        }
      } catch (err) {
        console.error('Failed to update preferences:', err);
        throw new Error('Failed to update preferences');
      }
    },
    [geoData],
  );

  const refresh = useCallback(async (): Promise<void> => {
    // Clear cache and re-detect
    if (typeof window !== 'undefined') {
      localStorage.removeItem(GEO_CACHE_KEY);
    }
    await detectGeo();
  }, []);

  // Initial detection
  useEffect(() => {
    detectGeo();
  }, []);

  // Derived values
  const currency =
    geoData?.userPreferences?.currency || geoData?.recommended.currency || Currency.MXN;

  const locale = (geoData?.userPreferences?.locale ||
    geoData?.recommended.locale ||
    'es') as Locale;

  return {
    geoData,
    loading,
    error,
    currency,
    locale,
    updatePreferences,
    refresh,
  };
}
