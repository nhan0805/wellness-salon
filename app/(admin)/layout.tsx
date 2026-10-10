import { redirect } from 'next/navigation';
import { auth } from '@/src/server/auth';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin console | Wellness Salon',
  description: 'Manage the Wellness Salon floor, queue, staff, services, and reports.',
};

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') redirect('/admin/sign-in');
  return children;
}
