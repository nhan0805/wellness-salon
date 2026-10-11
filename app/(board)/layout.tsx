import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live queue | Wellness Salon',
  description: 'View the live salon queue and staff availability.',
};

export default async function BoardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
