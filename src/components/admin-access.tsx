'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Edit3, LoaderCircle, LockKeyhole, Plus, RotateCcw, Tags, Trash2, UserCog, X } from 'lucide-react';
import { InitialsAvatar, SectionHeader, StatusBadge } from '@/src/components/ui';
import { useDialogFocus } from '@/src/components/use-dialog-focus';

type AccessKind = 'skills' | 'accounts';
type SkillRecord = { id: string; name: string; staffCount: number; serviceCount: number; createdAt: string };
type Account = { id: string; email: string; role: 'ADMIN' | 'STATION'; isActive: boolean; isCurrent: boolean; createdAt: string; updatedAt: string };
type SkillForm = { name: string };
type AccountForm = { email: string; password: string; role: Account['role'] };
type AccessModal = { type: 'skill'; record?: SkillRecord } | { type: 'account'; record?: Account } | null;

const endpointByKind: Record<AccessKind, string> = { skills: '/api/admin/skills', accounts: '/api/admin/accounts' };

export function AdminAccessManagement({ kind, onToast }: { kind: AccessKind; onToast: (message: string) => void }) {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modal, setModal] = useState<AccessModal>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(endpointByKind[kind], { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load this section');
      if (kind === 'skills') setSkills(payload.skills ?? []);
      if (kind === 'accounts') setAccounts(payload.accounts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this section');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  // This effect intentionally synchronizes the selected admin module with its API adapter.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function request(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    const response = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? 'The operation could not be completed');
    return payload;
  }

  async function submit(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown, message: string) {
    setBusy(true);
    setFormError('');
    try {
      await request(path, method, body);
      setModal(null);
      onToast(message);
      await load();
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'The operation could not be completed');
    } finally {
      setBusy(false);
    }
  }

  function openModal(next: AccessModal) {
    setFormError('');
    setModal(next);
  }

  async function deleteSkill(record: SkillRecord) {
    if (record.staffCount > 0 || record.serviceCount > 0 || !window.confirm(`Delete ${record.name}? This cannot be undone.`)) return;
    await submit(`${endpointByKind.skills}?id=${encodeURIComponent(record.id)}`, 'DELETE', undefined, `${record.name} deleted.`);
  }

  async function toggleAccount(record: Account) {
    if (record.isCurrent) return;
    if (record.isActive && !window.confirm(`Deactivate ${record.email}? They will no longer be able to sign in.`)) return;
    await submit(endpointByKind.accounts, 'PATCH', { id: record.id, email: record.email, password: '', role: record.role, isActive: !record.isActive }, record.isActive ? `${record.email} deactivated.` : `${record.email} reactivated.`);
  }

  async function deleteAccount(record: Account) {
    if (record.isCurrent || !window.confirm(`Delete ${record.email}? This permanently removes the account.`)) return;
    setBusy(true);
    setError('');
    try {
      await request(`${endpointByKind.accounts}?id=${encodeURIComponent(record.id)}`, 'DELETE');
      onToast(`${record.email} deleted.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The account could not be deleted');
    } finally {
      setBusy(false);
    }
  }

  const title = kind === 'skills' ? 'Skills' : 'Accounts';
  const description = kind === 'skills' ? 'Skills used to match services with available staff.' : 'Manage access for administrators and stations.';

  return <>
    <SectionHeader eyebrow="Access settings" title={title} description={description} action={<button className="button button-primary button-sm" onClick={() => openModal(kind === 'skills' ? { type: 'skill' } : { type: 'account' })} disabled={loading || busy}><Plus size={15} aria-hidden="true" /> Add {kind === 'skills' ? 'skill' : 'account'}</button>} />
    {error ? <div className="management-error" role="alert"><X size={17} aria-hidden="true" />{error}<button className="button button-quiet button-sm" onClick={() => void load()}>Retry</button></div> : null}
    {loading ? <div className="card management-loading" role="status"><LoaderCircle size={22} className="spin" aria-hidden="true" /> Loading {title.toLowerCase()}…</div> : <div className="card card-pad management-card">{kind === 'skills' ? <SkillsTable rows={skills} onEdit={(record) => openModal({ type: 'skill', record })} onDelete={deleteSkill} /> : <AccountsTable rows={accounts} onEdit={(record) => openModal({ type: 'account', record })} onToggle={toggleAccount} onDelete={deleteAccount} />}</div>}
    {modal?.type === 'skill' ? <AccessModal title={modal.record ? 'Edit skill' : 'Add skill'} description="Skills can be renamed at any time. A skill in use cannot be deleted." error={formError} onClose={() => setModal(null)}><SkillForm record={modal.record} busy={busy} onCancel={() => setModal(null)} onSubmit={(values) => submit(endpointByKind.skills, modal.record ? 'PATCH' : 'POST', modal.record ? { ...values, id: modal.record.id } : values, modal.record ? 'Skill updated.' : 'Skill added.')} /></AccessModal> : null}
    {modal?.type === 'account' ? <AccessModal className="account-modal" title={modal.record ? 'Edit account' : 'Add account'} description="Use a unique email and a strong password." error={formError} onClose={() => setModal(null)}><AccountForm record={modal.record} busy={busy} onCancel={() => setModal(null)} onSubmit={(values) => submit(endpointByKind.accounts, modal.record ? 'PATCH' : 'POST', modal.record ? { ...values, id: modal.record.id, isActive: modal.record.isActive } : values, modal.record ? 'Account updated.' : 'Account added.')} /></AccessModal> : null}
  </>;
}

function SkillsTable({ rows, onEdit, onDelete }: { rows: SkillRecord[]; onEdit: (record: SkillRecord) => void; onDelete: (record: SkillRecord) => void }) {
  if (!rows.length) return <EmptyAccessState icon={Tags} title="No skills yet" description="Add a skill before creating staff or service records." />;
  return <div className="admin-table-wrap"><table className="admin-table management-table"><caption className="sr-only">Skill definitions</caption><thead><tr><th>Skill</th><th>Staff using</th><th>Services using</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="table-customer"><InitialsAvatar initials={row.name.slice(0, 2).toUpperCase()} tone="blue" /><div><strong>{row.name}</strong><small>Added {formatDate(row.createdAt)}</small></div></div></td><td>{row.staffCount}</td><td>{row.serviceCount}</td><td><div className="table-actions"><button className="button button-quiet button-sm" onClick={() => onEdit(row)}><Edit3 size={15} aria-hidden="true" /> Edit</button><button className="button button-quiet button-sm" onClick={() => onDelete(row)} disabled={row.staffCount > 0 || row.serviceCount > 0} title={row.staffCount > 0 || row.serviceCount > 0 ? 'Skills assigned to staff or services cannot be deleted' : 'Delete skill'}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></td></tr>)}</tbody></table></div>;
}

function AccountsTable({ rows, onEdit, onToggle, onDelete }: { rows: Account[]; onEdit: (record: Account) => void; onToggle: (record: Account) => void; onDelete: (record: Account) => void }) {
  if (!rows.length) return <EmptyAccessState icon={UserCog} title="No accounts yet" description="Add an administrator or station account to manage access." />;
  return <div className="admin-table-wrap"><table className="admin-table management-table"><caption className="sr-only">Admin and station accounts</caption><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Last updated</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="table-customer"><InitialsAvatar initials={row.role === 'ADMIN' ? 'A' : 'S'} tone={row.role === 'ADMIN' ? 'blue' : 'teal'} /><div><strong>{row.email}</strong><small>{row.isCurrent ? 'Current session' : `Created ${formatDate(row.createdAt)}`}</small></div></div></td><td><StatusBadge label={row.role === 'ADMIN' ? 'Admin' : 'Station'} tone={row.role === 'ADMIN' ? 'blue' : 'neutral'} /></td><td><StatusBadge label={row.isActive ? 'Active' : 'Inactive'} tone={row.isActive ? 'success' : 'neutral'} /></td><td className="subtle">{formatDate(row.updatedAt)}</td><td><div className="table-actions"><button className="button button-quiet button-sm" onClick={() => onEdit(row)}><Edit3 size={15} aria-hidden="true" /> Edit</button><button className="button button-quiet button-sm" onClick={() => onToggle(row)} disabled={row.isCurrent} title={row.isCurrent ? 'The current account cannot be deactivated here' : row.isActive ? 'Deactivate account' : 'Reactivate account'}>{row.isActive ? <><LockKeyhole size={15} aria-hidden="true" /> Deactivate</> : <><RotateCcw size={15} aria-hidden="true" /> Reactivate</>}</button><button className="button button-danger button-sm" onClick={() => onDelete(row)} disabled={row.isCurrent} title={row.isCurrent ? 'The current account cannot be deleted here' : 'Delete account'}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></td></tr>)}</tbody></table></div>;
}

function SkillForm({ record, busy, onCancel, onSubmit }: { record?: SkillRecord; busy: boolean; onCancel: () => void; onSubmit: (values: SkillForm) => Promise<void> }) {
  const [values, setValues] = useState<SkillForm>({ name: record?.name ?? '' });
  return <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await onSubmit(values); }}><div className="field"><label htmlFor="managed-skill-name">Skill name</label><input id="managed-skill-name" value={values.name} onChange={(event) => setValues({ name: event.target.value })} autoComplete="off" required minLength={2} maxLength={80} /></div><div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : 'Add skill'}</button></div></form>;
}

function AccountForm({ record, busy, onCancel, onSubmit }: { record?: Account; busy: boolean; onCancel: () => void; onSubmit: (values: AccountForm) => Promise<void> }) {
  const [values, setValues] = useState<AccountForm>({ email: record?.email ?? '', password: '', role: record?.role ?? 'STATION' });
  return <form className="form-grid account-form" onSubmit={async (event) => { event.preventDefault(); await onSubmit(values); }}><div className="account-form-fields"><div className="field"><label htmlFor="managed-account-email">Email</label><input id="managed-account-email" type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} autoComplete="email" required maxLength={160} /></div><div className="field">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <label htmlFor="managed-account-role" style={{ margin: 0 }}>Role</label>
        {record?.isCurrent && (
          <span className="status-badge status-blue" style={{ fontSize: "0.6rem", minHeight: "auto", padding: "2px 8px" }}>Admin Only</span>
        )}
      </div>
      <select id="managed-account-role" value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value as Account['role'] })} disabled={record?.isCurrent} aria-describedby={record?.isCurrent ? 'managed-account-role-hint' : undefined}>
        <option value="ADMIN">Admin</option>
        <option value="STATION">Station</option>
      </select>
    </div><div className="field account-password-field"><label htmlFor="managed-account-password">{record ? 'New password (optional)' : 'Password'}</label><input id="managed-account-password" type="password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} autoComplete="new-password" minLength={record ? 0 : 8} maxLength={200} required={!record} placeholder={record ? 'Leave blank to keep the current password.' : 'At least 8 characters'} aria-describedby={record ? undefined : 'managed-account-password-hint'} />{record ? null : <span id="managed-account-password-hint" className="field-hint">Use a unique password for this account.</span>}</div></div><div className="form-actions account-form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : 'Add account'}</button></div></form>;
}

function AccessModal({ className = '', title, description, error, onClose, children }: { className?: string; title: string; description: string; error: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useDialogFocus(true, onClose);
  return <div className="modal-backdrop"><div className={`modal ${className}`.trim()} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="access-modal-title"><div className="modal-header"><div><h2 id="access-modal-title">{title}</h2><p>{description}</p></div><button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={19} aria-hidden="true" /></button></div>{error ? <div className="management-error modal-error" role="alert">{error}</div> : null}{children}</div></div>;
}

function EmptyAccessState({ icon: Icon, title, description }: { icon: typeof Tags; title: string; description: string }) {
  return <div className="empty-state"><Icon size={28} aria-hidden="true" /><div><strong>{title}</strong><br /><span>{description}</span></div></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
