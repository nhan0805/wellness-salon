'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function SignInPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const isAdminEntry = pathname === '/admin/sign-in';
  const accessLabel = isAdminEntry ? 'Administrator access' : 'Staff access';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError('Unable to sign in. Check your email and password and try again.');
      } else {
        router.replace(isAdminEntry ? '/admin' : '/board');
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sign-in-shell page-root">
      <header className="sign-in-header">
        <Link className="brand" href="/" aria-label="Wellness Salon home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-copy">Wellness Salon <small>Operations</small></span>
        </Link>
        <div className="sign-in-header-status">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>{accessLabel}</span>
        </div>
      </header>

      <div className="sign-in-layout">
        <section className="sign-in-side" aria-labelledby="sign-in-form-title">
          <div className="card sign-in-card">
            <div className="sign-in-card-header">
              <span className="sign-in-card-icon" aria-hidden="true"><LockKeyhole size={19} /></span>
              <span>{accessLabel}</span>
            </div>
            <div className="sign-in-card-title">
              <h1 id="sign-in-form-title">{isAdminEntry ? 'Welcome, administrator' : 'Welcome back'}</h1>
              <p>{isAdminEntry ? 'Sign in to manage the salon and review operations.' : 'Use your work email and password to continue.'}</p>
            </div>

            <form className="form-grid" onSubmit={submit} aria-busy={loading}>
              <div className="field sign-in-field">
                <label htmlFor="sign-in-email">Work email</label>
                <input
                  className="sign-in-input"
                  id="sign-in-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onTouchStart={(event) => event.currentTarget.focus()}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                  enterKeyHint="next"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'sign-in-error' : undefined}
                  required
                />
              </div>

              <div className="field sign-in-field">
                <div className="field-label-row">
                  <label htmlFor="sign-in-password">Password</label>
                </div>
                <div className="sign-in-password-control">
                  <input
                    className="sign-in-input"
                    id="sign-in-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onTouchStart={(event) => event.currentTarget.focus()}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    enterKeyHint="done"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'sign-in-error' : undefined}
                    required
                  />
                  <button
                    className="sign-in-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {error ? <p className="form-error sign-in-error" id="sign-in-error" role="alert">{error}</p> : null}

              <button className="button button-primary sign-in-submit" type="submit" disabled={loading}>
                <span>{loading ? 'Signing in…' : 'Sign in'}</span>
                {loading ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
              </button>
            </form>

            <div className="sign-in-card-footer">
              <span><ShieldCheck size={15} aria-hidden="true" /> Authorized staff only</span>
              <Link href="/">Return to home</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
