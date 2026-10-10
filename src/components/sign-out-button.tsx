'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

export function SignOutButton({ callbackUrl, className }: { callbackUrl: string; className: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOut({ callbackUrl });
  }

  return <button type="button" className={className} onClick={() => void handleSignOut()} disabled={loading}><LogOut size={15} aria-hidden="true" /> {loading ? 'Signing out…' : 'Sign out'}</button>;
}
