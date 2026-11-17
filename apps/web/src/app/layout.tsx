import { Manrope } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { EchartsThemeRegistrar } from '@/components/layout/echarts-theme-registrar';
import './globals.css';

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'CATV',
  description: 'Cable network management',
};

const themeScript = `(function(){try{var t=localStorage.getItem('catv-theme');var dark=t?t==='dark':true;document.documentElement.classList.toggle('dark',dark);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <EchartsThemeRegistrar />
        {children}
      </body>
    </html>
  );
}
