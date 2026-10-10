'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { signIn } from 'next-auth/react';

export default function SignInPanel() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    
    const result = await signIn('credentials', { 
      email, 
      password, 
      redirect: false, 
      callbackUrl: '/' 
    });

    if (result?.error) {
      setError('Could not log in. Check the account and try again.');
    } else {
      router.replace('/');
    }
    setLoading(false);
  }

  return (
    <main className="sign-in-shell page-root">
      <section className="sign-in-visual">
        <Link className="brand" href="/">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Operations</small></span>
        </Link>
        <div>
          <div className="eyebrow" style={{ color: 'var(--color-peach)' }}>Secure Access</div>
          <h1>Keep the floor <span>flowing.</span></h1>
          <p>Log in to access your workspace. The system will automatically route you to your dashboard based on your account role.</p>
        </div>
        <div className="subtle" style={{ color: 'var(--color-on-dark-muted)' }}>Single-shop operations workspace · Shared tablet access</div>
      </section>

      <section className="sign-in-side">
        <div className="card sign-in-card">
          <div style={{ 
            display: 'inline-flex', 
            padding: '8px', 
            borderRadius: '12px', 
            background: 'var(--color-muted)', 
            color: 'var(--color-primary)',
            marginBottom: '12px'
          }}>
            <Sparkles size={24} aria-hidden="true" />
          </div>
          <h2 style={{ marginTop: 0 }}>Log in</h2>
          <p>Enter your credentials to continue to your workspace.</p>
          <form className="form-grid" onSubmit={submit}>
            <div className="field">
              <label htmlFor="sign-in-email">Email</label>
              <input id="sign-in-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="sign-in-password">Password</label>
              <input id="sign-in-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            {error ? <p role="alert" style={{ margin: 0, color: 'var(--color-danger)', fontSize: '0.84rem' }}>{error}</p> : null}
            <div className="form-actions">
              <Link className="button button-quiet" href="/">Cancel</Link>
              <button className="button button-primary" disabled={loading}>
                {loading ? 'Logging in…' : <>Continue <ArrowRight size={16} aria-hidden="true" /></>}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
