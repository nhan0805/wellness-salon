'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';

type SafariNavigator = Navigator & { standalone?: boolean };
type SafariLoginLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: ComponentProps<typeof Link>['href'] };

function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as SafariNavigator).standalone === true;
}

export default function SafariLoginLink({ href, target, rel, children, ...rest }: SafariLoginLinkProps) {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(isStandalonePwa());
    update();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return (
    <Link
      {...rest}
      href={href}
      target={standalone ? '_blank' : target}
      rel={standalone ? 'external noopener noreferrer' : rel}
    >
      {children}
    </Link>
  );
}
