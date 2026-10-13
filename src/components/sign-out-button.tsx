'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';

export function SignOutButton({ callbackUrl, className, role }: { callbackUrl: string; className: string; role?: 'menuitem' }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign(callbackUrl.startsWith('/') ? callbackUrl : '/');
    }
  }

  return <button type="button" role={role} className={className} onClick={() => void handleSignOut()} disabled={loading}><LogOut size={15} aria-hidden="true" /> {loading ? 'Signing out…' : 'Sign out'}</button>;
}
