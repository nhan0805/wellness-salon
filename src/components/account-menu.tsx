'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Monitor, ShieldCheck } from 'lucide-react';
import { InitialsAvatar } from '@/src/components/ui';
import { SignOutButton } from '@/src/components/sign-out-button';
import type { AccountViewer } from '@/src/domain/viewer';

export function AccountMenu({ viewer, callbackUrl }: { viewer: AccountViewer; callbackUrl: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const roleLabel = viewer.role === 'ADMIN' ? 'Admin' : 'Station';
  const RoleIcon = viewer.role === 'ADMIN' ? ShieldCheck : Monitor;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={`account-menu account-menu-${viewer.role.toLowerCase()}`} ref={menuRef}>
      <button
        type="button"
        ref={triggerRef}
        className="account-menu-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account: ${viewer.displayName}`}
        onClick={() => setOpen((current) => !current)}
      >
        <InitialsAvatar initials={viewer.initials} tone={viewer.role === 'ADMIN' ? 'blue' : 'teal'} />
        <span className="account-menu-trigger-copy">
          <strong>{viewer.displayName}</strong>
          <small className="account-menu-trigger-email">{viewer.email || 'Signed in account'}</small>
          <small className="account-menu-trigger-role-label">{roleLabel}</small>
        </span>
        <span className="account-menu-role">{roleLabel}</span>
        <ChevronDown size={16} aria-hidden="true" className={open ? 'is-open' : undefined} />
      </button>

      {open ? (
        <div className="account-menu-panel" role="dialog" aria-label="Account menu">
          <div className="account-menu-profile">
            <InitialsAvatar initials={viewer.initials} tone={viewer.role === 'ADMIN' ? 'blue' : 'teal'} />
            <div>
              <strong>{viewer.displayName}</strong>
              <span>{viewer.email || 'Signed in account'}</span>
            </div>
            <span className="account-menu-profile-role">
              <RoleIcon size={14} aria-hidden="true" />
              {roleLabel}
            </span>
          </div>
          <div className="account-menu-divider" />
          <SignOutButton callbackUrl={callbackUrl} className="account-menu-signout" role="menuitem" />
        </div>
      ) : null}
    </div>
  );
}
