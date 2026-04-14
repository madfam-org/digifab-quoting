'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogOut, Settings, FileText } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CurrencySelector } from '@/components/currency/CurrencySelector';
import { useTranslation } from '@/hooks/useTranslation';

export function Navbar() {
  const { data: session } = useSession();
  const { t } = useTranslation('common');

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Cotiza Studio
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <Link
                href="/try"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 font-semibold"
              >
                {t('nav.try')}
              </Link>
              {session ? (
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    href="/quotes"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('nav.quotes')}
                  </Link>
                  <Link
                    href="/quote/new"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('nav.newQuote')}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/pricing"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('nav.pricing')}
                  </Link>
                  <Link
                    href="/features"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('nav.features')}
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <CurrencySelector 
              size="sm" 
              variant="outline"
              className="hidden sm:flex"
            />
            <LanguageSwitcher />
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {session.user?.name || 'User'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session.user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard">
                      <FileText className="mr-2 h-4 w-4" />
                      {t('nav.dashboard')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      {t('nav.settings')}
                    </Link>
                  </DropdownMenuItem>
                  
                  <div className="sm:hidden px-2 py-1">
                    <CurrencySelector 
                      size="sm"
                      variant="ghost"
                    />
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('nav.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/auth/login">
                  <Button variant="ghost">{t('nav.signIn')}</Button>
                </Link>
                <Link href="/try">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg">
                    {t('nav.try')}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
