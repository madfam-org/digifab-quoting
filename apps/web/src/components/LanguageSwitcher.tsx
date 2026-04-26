'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

type Language = {
  code: string;
  name: string;
  flag: string;
  nativeName: string;
};

const languages: Language[] = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'en', name: 'English', flag: '🇬🇧', nativeName: 'English' },
  { code: 'pt-BR', name: 'Portuguese', flag: '🇧🇷', nativeName: 'Português' },
];

export function LanguageSwitcher() {
  const { locale, changeLanguage } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentLanguage = languages.find((lang) => lang.code === locale) || languages[0];

  const handleLanguageChange = (newLocale: string) => {
    // Save preference in cookie (expires in 1 year)
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;

    // Save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredLocale', newLocale);
    }

    // Change language using the hook
    changeLanguage(newLocale);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors">
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">ES</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors">
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline">{currentLanguage.flag}</span>
          <span className="hidden md:inline text-xs">{currentLanguage.code.toUpperCase()}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`cursor-pointer ${locale === lang.code ? 'bg-gray-100' : ''}`}
          >
            <span className="mr-2 text-lg">{lang.flag}</span>
            <div className="flex-1">
              <div className="font-medium">{lang.nativeName}</div>
              <div className="text-xs text-gray-500">{lang.name}</div>
            </div>
            {locale === lang.code && <span className="ml-auto text-blue-600">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Standalone language detector for initial load
export function detectUserLanguage(): string {
  if (typeof window === 'undefined') return 'es';

  // Check cookie first
  const cookieLocale = document.cookie
    .split('; ')
    .find((row) => row.startsWith('NEXT_LOCALE='))
    ?.split('=')[1];

  if (cookieLocale && ['es', 'en', 'pt-BR'].includes(cookieLocale)) {
    return cookieLocale;
  }

  // Check localStorage
  const storedLocale = localStorage.getItem('preferredLocale');
  if (storedLocale && ['es', 'en', 'pt-BR'].includes(storedLocale)) {
    return storedLocale;
  }

  // Check browser language
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('pt')) return 'pt-BR';
  if (browserLang.startsWith('en')) return 'en';
  if (browserLang.startsWith('es')) return 'es';

  // Default to Spanish
  return 'es';
}
