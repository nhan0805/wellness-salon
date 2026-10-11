import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Sparkles, LogIn } from 'lucide-react';
import { auth } from '@/src/server/auth';

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
    <main className="entry-shell page-root">
      <header className="app-topbar">
        <Link className="brand" href="/" aria-label="Wellness Salon home">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Operations</small></span>
        </Link>
        <div className="topbar-actions">
          <Link className="button button-quiet button-sm" href="/sign-in">
            <LogIn size={16} aria-hidden="true" />
            Log in
          </Link>
        </div>
      </header>
      <section className="container entry-screen" aria-labelledby="entry-title">
        <div className="entry-card">
          <div className="eyebrow">Wellness Salon</div>
          <h1 id="entry-title">Choose where to start</h1>
          <p>Open customer check-in or the live queue.</p>
          <div className="entry-actions">
            <Link className="button button-primary" href="/kiosk">Customer check-in <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link className="button button-outline" href="/board">Live queue</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
