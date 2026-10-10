'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { SectionHeader, StatusBadge } from '@/src/components/ui';

type SkipReason = { id: string; name: string; sortOrder: number; isActive: boolean };
type ShopConfig = { timezone: string; openingTime: string; closingTime: string; currency: string; verifiedSessionTtlMin: number; roundRobinEnabled: boolean };

export function AdminSkipReasons({ onToast }: { onToast: (message: string) => void }) {
  const [rows, setRows] = useState<SkipReason[]>([]);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/skip-reasons', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load skip reasons');
      setRows(payload.skipReasons ?? []);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load skip reasons'); } finally { setLoading(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  function reset() { setEditingId(null); setName(''); setSortOrder('0'); setIsActive(true); }

  function edit(row: SkipReason) { setEditingId(row.id); setName(row.name); setSortOrder(String(row.sortOrder)); setIsActive(row.isActive); }

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/skip-reasons', { method: editingId ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(editingId ? { id: editingId, isActive } : {}), name, sortOrder: Number(sortOrder) || 0 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save skip reason');
      onToast(editingId ? 'Skip reason updated.' : 'Skip reason created.');
      reset();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save skip reason'); } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this skip reason? Historical reasons cannot be deleted.')) return;
    const response = await fetch(`/api/admin/skip-reasons?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error ?? 'Unable to delete skip reason'); return; }
    onToast('Skip reason deleted.');
    await load();
  }

  return <><SectionHeader eyebrow="Queue controls" title="Skip reasons" description="Manage the reasons staff can choose. Disabling a reason preserves history while preventing new use." action={<StatusBadge label={`${rows.filter((row) => row.isActive).length} active`} tone="success" />} /><div className="card card-pad"><div className="inline-form-grid"><div className="field"><label htmlFor="skip-reason-name">Reason name</label><input id="skip-reason-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer not ready" /></div><div className="field"><label htmlFor="skip-reason-order">Display order</label><input id="skip-reason-order" type="number" min="0" max="999" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></div>{editingId ? <label className="checkbox-field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active for new skips</label> : null}<div className="form-actions"><button type="button" className="button button-primary" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? 'Saving…' : editingId ? <><Save size={16} aria-hidden="true" /> Save changes</> : <><Plus size={16} aria-hidden="true" /> Add reason</>}</button>{editingId ? <button type="button" className="button button-quiet" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Cancel edit</button> : null}</div></div>{error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <div className="management-loading" role="status">Loading skip reasons…</div> : rows.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Reason</th><th>Order</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.sortOrder}</td><td><StatusBadge label={row.isActive ? 'Active' : 'Disabled'} tone={row.isActive ? 'success' : 'neutral'} /></td><td><div className="table-actions"><button type="button" className="button button-quiet button-sm" onClick={() => edit(row)}><Pencil size={15} aria-hidden="true" /> Edit</button><button type="button" className="button button-quiet button-sm" onClick={() => void remove(row.id)}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><span>No skip reasons configured.</span></div>}</div></>;
}

export function AdminShopConfig({ onToast }: { onToast: (message: string) => void }) {
  const [form, setForm] = useState<ShopConfig>({ timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', currency: 'USD', verifiedSessionTtlMin: 3, roundRobinEnabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/config', { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load shop configuration');
      if (active && payload.shop) setForm({ timezone: payload.shop.timezone, openingTime: payload.shop.openingTime, closingTime: payload.shop.closingTime, currency: payload.shop.currency, verifiedSessionTtlMin: payload.shop.verifiedSessionTtlMin, roundRobinEnabled: payload.shop.roundRobinEnabled });
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load shop configuration'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save shop configuration');
      onToast('Shop configuration updated.');
      if (payload.shop) setForm({ timezone: payload.shop.timezone, openingTime: payload.shop.openingTime, closingTime: payload.shop.closingTime, currency: payload.shop.currency, verifiedSessionTtlMin: payload.shop.verifiedSessionTtlMin, roundRobinEnabled: payload.shop.roundRobinEnabled });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save shop configuration'); } finally { setSaving(false); }
  }

  if (loading) return <div className="card management-loading" role="status">Loading shop configuration…</div>;
  return <><SectionHeader eyebrow="Operating rules" title="Shop configuration" description="These settings drive kiosk availability, session verification, currency presentation, and closing behavior." /><div className="card card-pad"><div className="form-grid two-column-form"><div className="field"><label htmlFor="shop-timezone">Timezone</label><input id="shop-timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></div><div className="field"><label htmlFor="shop-currency">Currency</label><input id="shop-currency" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></div><div className="field"><label htmlFor="shop-opening">Opening time</label><input id="shop-opening" type="time" value={form.openingTime} onChange={(event) => setForm({ ...form, openingTime: event.target.value })} /></div><div className="field"><label htmlFor="shop-closing">Closing time</label><input id="shop-closing" type="time" value={form.closingTime} onChange={(event) => setForm({ ...form, closingTime: event.target.value })} /></div><div className="field"><label htmlFor="shop-session-ttl">Verified PIN session (minutes)</label><input id="shop-session-ttl" type="number" min="1" max="15" value={form.verifiedSessionTtlMin} onChange={(event) => setForm({ ...form, verifiedSessionTtlMin: Number(event.target.value) })} /></div><label className="checkbox-field"><input type="checkbox" checked={form.roundRobinEnabled} onChange={(event) => setForm({ ...form, roundRobinEnabled: event.target.checked })} /> Use fair turn routing</label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="form-actions"><button type="button" className="button button-primary" onClick={() => void save()} disabled={saving}><Check size={16} aria-hidden="true" />{saving ? 'Saving…' : 'Save configuration'}</button></div></div></>;
}
