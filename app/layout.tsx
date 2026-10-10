import './globals.css';
import type { Viewport } from 'next';
import PWAProvider from '@/src/components/PWAProvider';

export const metadata = {
  title: 'Wellness Salon',
  description: 'Tablet-first operations for a modern nail shop.',
  manifest: '/manifest-v1.json?v=4',
  icons: {
    icon: '/icons/icon-sparkles-512.png?v=1',
    apple: '/icons/icon-sparkles-192.png?v=1',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Wellness Salon',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#E8BFC5',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PWAProvider />
        {children}
      </body>
    </html>
  );
}
