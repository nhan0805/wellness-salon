import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Self check-in | Wellness Salon',
  description: 'Choose your services and join the Wellness Salon turn board.',
};

export default function KioskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
