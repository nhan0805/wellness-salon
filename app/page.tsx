import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Sparkles, LogIn } from 'lucide-react';
import { auth } from '@/src/server/auth';
import RolePreview from '@/src/components/role-preview';

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
    <main className="landing-shell page-root">
      <header className="app-topbar">
        <Link className="brand" href="/" aria-label="Wellness Salon Management home">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Management</small></span>
        </Link>
        <div className="topbar-actions">
          <Link className="button button-quiet button-sm" href="/sign-in">
            <LogIn size={16} aria-hidden="true" />
            Log in
          </Link>
        </div>
      </header>
      <section className="container landing-hero">
        <div>
          <div className="eyebrow">One calm operating system</div>
          <h1>Make every turn feel <span>intentional.</span></h1>
          <p>A tablet-first command center for welcoming guests, routing the right specialist, and closing the day with confidence.</p>
          <div className="landing-cta">
            <Link className="button button-primary" href="/kiosk">Open customer kiosk <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link className="button button-outline" href="/board">View turn board</Link>
          </div>
          <div className="landing-note"><CheckCircle2 size={17} aria-hidden="true" /> <span>Designed for the front desk, the floor, and the owner’s end-of-day review.</span></div>
        </div>
        <RolePreview />
      </section>
    </main>
  );
}
