import './globals.css';
import type { Metadata, Viewport } from 'next';
import PWAProvider from '@/src/components/PWAProvider';

export const metadata: Metadata = {
  title: 'Wellness Salon',
  description: 'Salon operations for guest check-in, queue management, staff, services, and payments.',
  manifest: '/manifest-v1.json?v=10',
  icons: {
    icon: '/icons/wellness-mark-b-512.png?v=1',
    apple: '/icons/wellness-mark-b-512.png?v=2',
  },
  appleWebApp: {
    capable: true,
    title: 'Wellness Salon',
    statusBarStyle: 'default',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
