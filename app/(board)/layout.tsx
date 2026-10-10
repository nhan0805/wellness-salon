import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Turn board | Wellness Salon',
  description: 'A live view of the Wellness Salon queue and staff availability.',
};

export default async function BoardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
