'use client';

import { useEffect, useRef } from 'react';

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared touch-safe dialog behavior: initial focus, Escape, Tab trapping, and focus restoration. */
export function useDialogFocus(open: boolean, onClose: () => void, options: { stopPropagation?: boolean } = {}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const stopPropagation = options.stopPropagation ?? false;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusFirstControl = () => {
      const first = dialog.querySelector<HTMLElement>('[data-dialog-focus], input, select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      first?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      if (stopPropagation) event.stopPropagation();
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.setTimeout(focusFirstControl, 0);
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      openerRef.current?.focus();
    };
  }, [open, stopPropagation]);

  return dialogRef;
}
