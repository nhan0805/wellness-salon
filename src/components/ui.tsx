import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, CircleDashed, Clock3 } from 'lucide-react';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'blue' }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? Clock3 : tone === 'danger' ? CircleAlert : CircleDashed;
  return <span className={`status-badge status-${tone}`}><Icon size={14} strokeWidth={2} aria-hidden="true" />{label}</span>;
}

export function InitialsAvatar({ initials, tone = 'blue' }: { initials: string; tone?: 'blue' | 'orange' | 'teal' | 'slate' }) {
  return <span className={`avatar avatar-${tone}`} aria-hidden="true">{initials}</span>;
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action}</div>;
}

export function StateIcon({ state }: { state: 'done' | 'active' | 'waiting' }) {
  if (state === 'done') return <CheckCircle2 size={18} aria-hidden="true" />;
  if (state === 'active') return <Clock3 size={18} aria-hidden="true" />;
  return <CircleDashed size={18} aria-hidden="true" />;
}

export function ErrorMessage({ children, id }: { children: ReactNode; id?: string }) {
  return <p id={id} role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.84rem', margin: '8px 0 0' }}><CircleAlert size={15} style={{ verticalAlign: '-3px', marginRight: 5 }} aria-hidden="true" />{children}</p>;
}
