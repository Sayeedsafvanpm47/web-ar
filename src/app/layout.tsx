import type { Metadata } from 'next';
import { Archivo, Fraunces, IBM_Plex_Sans_Arabic } from 'next/font/google';

import './globals.css';

/**
 * Blackpearl's typefaces, matching blackpearlqa.com: Fraunces for display,
 * Archivo for body and UI. Both self-hosted by next/font.
 *
 * IBM Plex Sans Arabic is the Arabic companion: a neutral humanist sans that
 * sits at a similar weight and width to Archivo, so a mixed page does not read
 * as two unrelated documents. It is applied only under dir="rtl".
 */
const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
});

const archivo = Archivo({
  variable: '--font-body',
  subsets: ['latin'],
  display: 'swap',
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-arabic',
  subsets: ['arabic'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Live photo book — Blackpearl',
    template: '%s — Blackpearl',
  },
  description: 'Printed photo books that play your videos.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${archivo.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink font-body flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
