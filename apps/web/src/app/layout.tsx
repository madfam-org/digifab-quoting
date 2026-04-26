import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/navbar';
import { Toaster } from '@/components/ui/toaster';
import { PmfWidgetMount } from '@/components/pmf/PmfWidgetMount';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cotiza Studio - Digital Fabrication Services',
  description: 'Get instant quotes for 3D printing, CNC machining, and laser cutting',
};

// Force dynamic rendering to prevent NextRouter mounting issues during build
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <Navbar />
          <main>{children}</main>
          <Toaster />
          <PmfWidgetMount />
        </Providers>
      </body>
    </html>
  );
}
