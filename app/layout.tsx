import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AppProvider, Header } from '@/components/taqueria';
import './globals.css';
const inter = localFont({ src: '../public/fonts/Inter.ttf', variable: '--font-inter', display: 'swap' });
const barlow = localFont({ src: '../public/fonts/BarlowCondensed-SemiBold.ttf', variable: '--font-barlow', weight: '600', display: 'swap' });
export const metadata: Metadata = { title: 'Menú y Pedidos · Taquería de ejemplo', description: 'Explora un menú ficticio, personaliza tus productos y guarda un pedido como demostración. No se envía a una taquería real.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body className={`${inter.variable} ${barlow.variable} antialiased`}><AppProvider><Header />{children}</AppProvider></body></html>;
}
