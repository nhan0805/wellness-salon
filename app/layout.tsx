import './globals.css';
import type { Viewport } from 'next';
import PWAProvider from '@/src/components/PWAProvider';

export const metadata = {
  title: 'Wellness Salon',
  description: 'Salon operations for guest check-in, queue management, staff, services, and payments.',
  manifest: '/manifest-v1.json?v=6',
  icons: {
    icon: '/icons/wellness-mark-b-512.png?v=1',
    apple: '/icons/wellness-mark-b-192.png?v=1',
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
