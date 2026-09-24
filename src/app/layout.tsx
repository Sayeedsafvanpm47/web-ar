import type { Metadata } from 'next';
import { Archivo, Fraunces } from 'next/font/google';

import './globals.css';

/**
 * Black Pearl's typefaces, matching blackpearlqa.com: Fraunces for display,
 * Archivo for everything else.
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

export const metadata: Metadata = {
  title: {
    default: 'Living Memories — Black Pearl',
    template: '%s — Black Pearl',
  },
  description: 'Printed photo books that play your videos.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink flex min-h-full flex-col font-body">
        {children}
      </body>
    </html>
  );
}
