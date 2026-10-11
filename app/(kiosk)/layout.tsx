import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer check-in | Wellness Salon',
  description: 'Choose services, enter your details, and join the salon queue.',
};

export default function KioskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
