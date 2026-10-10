import { auth } from '@/src/server/auth';

export async function getAdminActor() {
  const session = await auth();
  return session?.user?.role === 'ADMIN' && session.user.id ? { id: session.user.id } : null;
}
