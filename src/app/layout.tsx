import type { Metadata } from 'next';
import { DM_Mono, Syne, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const dmMono = DM_Mono({ weight: ['300','400','500'], subsets: ['latin'], variable: '--font-mono' });
const syne = Syne({ weight: ['400','600','700','800'], subsets: ['latin'], variable: '--font-syne' });

export const metadata: Metadata = {
  title: 'arbi.to — Pipeline Intelligence',
  description: 'Personal biotech pipeline analyzer. Shkreli framework.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${dmMono.variable} ${syne.variable}`}>
      <body>{children}</body>
    </html>
  );
}
