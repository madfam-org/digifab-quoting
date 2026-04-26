'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
];

export function LanguageSettings() {
  const { locale, t } = useTranslation('profile');
  const [selectedLocale, setSelectedLocale] = useState(locale);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSelectedLocale(locale);
  }, [locale]);

  const handleSave = async () => {
    if (selectedLocale === locale) return;

    setLoading(true);
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferredLocale: selectedLocale }),
      });

      if (!response.ok) {
        throw new Error('Failed to update language preference');
      }

      // Save to localStorage for immediate effect
      localStorage.setItem('preferredLocale', selectedLocale);

      // Reload page with new locale
      const currentPath = window.location.pathname;
      const newPath = currentPath.replace(/^\/(es|en|pt-BR)/, `/${selectedLocale}`);

      if (newPath !== currentPath) {
        window.location.href = newPath;
      } else {
        window.location.href = `/${selectedLocale}${currentPath}`;
      }

      toast({
        title: t('profile.language.success'),
        description: t('profile.language.successDescription'),
      });
    } catch (error) {
      console.error('Error updating language:', error);
      toast({
        title: t('profile.language.error'),
        description: t('profile.language.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Globe className="h-5 w-5 text-gray-500" />
        <h3 className="text-lg font-semibold">{t('profile.language.title')}</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('profile.language.preferred')}
          </label>
          <div className="flex space-x-3">
            <select
              value={selectedLocale}
              onChange={(e) => setSelectedLocale(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
            <Button onClick={handleSave} disabled={loading || selectedLocale === locale}>
              {loading ? t('common.saving') : t('common.save')}
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500">{t('profile.language.description')}</p>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            {t('profile.language.detection')}
          </h4>
          <p className="text-sm text-gray-500">{t('profile.language.detectionDescription')}</p>
          <ul className="mt-2 text-sm text-gray-500 list-disc list-inside">
            <li>{t('profile.language.detectionBrowser')}</li>
            <li>{t('profile.language.detectionAccount')}</li>
            <li>{t('profile.language.detectionDefault')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
