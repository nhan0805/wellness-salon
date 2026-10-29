import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ListOrdered, LogIn, ScanLine, Sparkles } from 'lucide-react';
import { auth } from '@/src/server/auth';
import SafariLoginLink from '@/src/components/safari-login-link';

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    const role = session.user.role;
    if (role === 'ADMIN') {
      redirect('/admin');
    } else if (role === 'STATION') {
      redirect('/board');
    }
  }

  return (
    <main id="main-content" className="entry-shell page-root">
      <header className="app-topbar">
        <Link className="brand" href="/" aria-label="Wellness Salon home">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Operations</small></span>
        </Link>
        <div className="topbar-actions">
          <SafariLoginLink className="button button-quiet button-sm" href="/sign-in">
            <LogIn size={16} aria-hidden="true" />
            Log in
          </SafariLoginLink>
        </div>
      </header>
      <section className="container entry-screen" aria-labelledby="entry-title">
        <div className="entry-card">
          <div className="eyebrow">Operations hub</div>
          <h1 id="entry-title">Choose where to start</h1>
          <p>Choose the workspace that matches what you need to do right now.</p>
          <div className="entry-choice-grid">
            <Link className="entry-choice entry-choice-primary" href="/kiosk">
              <span className="entry-choice-icon"><ScanLine size={22} aria-hidden="true" /></span>
              <span><strong>Customer check-in</strong><small>Start a new visit at the salon station.</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="entry-choice" href="/board">
              <span className="entry-choice-icon"><ListOrdered size={22} aria-hidden="true" /></span>
              <span><strong>Live queue</strong><small>Monitor guests, staff, and service progress.</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="entry-card-footer"><span>Staff workspace</span><SafariLoginLink href="/sign-in"><LogIn size={16} aria-hidden="true" /> Sign in to manage operations</SafariLoginLink></div>
        </div>
      </section>
    </main>
  );
}
