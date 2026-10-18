'use client';

import { useEffect, useState } from 'react';
import { Check, CircleDollarSign, Clock3, Globe2, Info, Pencil, Plus, RotateCcw, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { SectionHeader, StatusBadge } from '@/src/components/ui';
import { parseApiResponse } from '@/src/client/api-response';
import { CURRENCY_OPTIONS, DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, timezoneGroup } from '@/src/domain/locale-options';

type SkipReason = { id: string; name: string; sortOrder: number; isActive: boolean };
type ShopConfig = { timezone: string; openingTime: string; closingTime: string; currency: string; verifiedSessionTtlMin: number; roundRobinEnabled: boolean };

const DEFAULT_SHOP_CONFIG: ShopConfig = { timezone: DEFAULT_TIMEZONE, openingTime: '09:00', closingTime: '21:00', currency: 'USD', verifiedSessionTtlMin: 3, roundRobinEnabled: true };

function shopConfigsMatch(left: ShopConfig, right: ShopConfig) {
  return left.timezone === right.timezone && left.openingTime === right.openingTime && left.closingTime === right.closingTime && left.currency === right.currency && left.verifiedSessionTtlMin === right.verifiedSessionTtlMin && left.roundRobinEnabled === right.roundRobinEnabled;
}

function formatTimeLabel(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes));
}

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
      const payload = await parseApiResponse<{ skipReasons?: SkipReason[] }>(
        response,
        'Unable to load skip reasons',
      );
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
      await parseApiResponse<Record<string, unknown>>(response, 'Unable to save skip reason');
      onToast(editingId ? 'Skip reason updated.' : 'Skip reason created.');
      reset();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save skip reason'); } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this skip reason? Historical reasons cannot be deleted.')) return;
    const response = await fetch(`/api/admin/skip-reasons?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    try {
      await parseApiResponse<Record<string, unknown>>(response, 'Unable to delete skip reason');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to delete skip reason');
      return;
    }
    onToast('Skip reason deleted.');
    await load();
  }

  return <><SectionHeader eyebrow="Queue settings" title="Skip reasons" description="Manage the reasons staff can select when a service cannot be taken." action={<StatusBadge label={`${rows.filter((row) => row.isActive).length} active`} tone="success" />} /><div className="card card-pad"><div className="inline-form-grid"><div className="field"><label htmlFor="skip-reason-name">Reason name</label><input id="skip-reason-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer not ready" /></div><div className="field"><label htmlFor="skip-reason-order">Display order</label><input id="skip-reason-order" type="number" min="0" max="999" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></div>{editingId ? <label className="checkbox-field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active for new skips</label> : null}<div className="form-actions"><button type="button" className="button button-primary" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? 'Saving…' : editingId ? <><Save size={16} aria-hidden="true" /> Save changes</> : <><Plus size={16} aria-hidden="true" /> Add reason</>}</button>{editingId ? <button type="button" className="button button-quiet" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Cancel edit</button> : null}</div></div>{error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <div className="management-loading" role="status">Loading skip reasons…</div> : rows.length ? <div className="admin-table-wrap"><table className="admin-table skip-reasons-table"><thead><tr><th>Reason</th><th>Order</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.sortOrder}</td><td><StatusBadge label={row.isActive ? 'Active' : 'Disabled'} tone={row.isActive ? 'success' : 'neutral'} /></td><td><div className="table-actions"><button type="button" className="button button-quiet button-sm" onClick={() => edit(row)}><Pencil size={15} aria-hidden="true" /> Edit</button><button type="button" className="button button-quiet button-sm" onClick={() => void remove(row.id)}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><span>No skip reasons configured.</span></div>}</div></>;
}

export function AdminShopConfig({ onToast }: { onToast: (message: string) => void }) {
  const [form, setForm] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [savedForm, setSavedForm] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openHelp, setOpenHelp] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/config', { cache: 'no-store' }).then(async (response) => {
      const payload = await parseApiResponse<{ shop?: ShopConfig }>(
        response,
        'Unable to load salon settings',
      );
      if (active && payload.shop) {
        const nextForm: ShopConfig = { timezone: payload.shop.timezone, openingTime: payload.shop.openingTime, closingTime: payload.shop.closingTime, currency: payload.shop.currency, verifiedSessionTtlMin: payload.shop.verifiedSessionTtlMin, roundRobinEnabled: payload.shop.roundRobinEnabled };
        setForm(nextForm);
        setSavedForm(nextForm);
      }
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load salon settings'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!openHelp) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenHelp(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [openHelp]);

  function updateField<Key extends keyof ShopConfig>(key: Key, value: ShopConfig[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  const hasChanges = !shopConfigsMatch(form, savedForm);

  function discardChanges() {
    setForm(savedForm);
    setError('');
    setOpenHelp(null);
  }

  async function save() {
    if (!hasChanges) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await parseApiResponse<{ shop?: ShopConfig }>(
        response,
        'Unable to save salon settings',
      );
      onToast('Salon settings updated.');
      const nextForm: ShopConfig = payload.shop ? { timezone: payload.shop.timezone, openingTime: payload.shop.openingTime, closingTime: payload.shop.closingTime, currency: payload.shop.currency, verifiedSessionTtlMin: payload.shop.verifiedSessionTtlMin, roundRobinEnabled: payload.shop.roundRobinEnabled } : form;
      setForm(nextForm);
      setSavedForm(nextForm);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save salon settings'); } finally { setSaving(false); }
  }

  if (loading) return <div className="salon-settings-loading card" role="status"><span className="salon-settings-loading-dot" />Loading salon settings…</div>;
  const hasKnownTimezone = TIMEZONE_OPTIONS.some((option) => option.value === form.timezone);
  const timezoneOptions = hasKnownTimezone ? TIMEZONE_OPTIONS : [{ value: form.timezone, label: `${form.timezone} (current)` }, ...TIMEZONE_OPTIONS];
  const timezoneGroups = [...new Set(timezoneOptions.map((option) => timezoneGroup(option.value)))].sort((a, b) => a.localeCompare(b));
  const hasKnownCurrency = CURRENCY_OPTIONS.some((option) => option.value === form.currency);
  const currencyOptions = hasKnownCurrency ? CURRENCY_OPTIONS : [{ value: form.currency, label: `${form.currency} (current)` }, ...CURRENCY_OPTIONS];
  return <div className="salon-settings">
    <header className="salon-settings-heading">
      <div className="salon-settings-heading-copy">
        <div className="eyebrow">General settings</div>
        <div className="salon-settings-heading-row">
          <span className="salon-settings-title-icon" aria-hidden="true"><Globe2 size={22} strokeWidth={1.8} /></span>
          <div>
            <h2>Salon settings</h2>
            <p>Manage the details that keep your check-in, payments, and queue running smoothly.</p>
          </div>
        </div>
      </div>
      <div className={`salon-save-status ${hasChanges ? 'is-dirty' : ''}`} role="status" aria-live="polite"><span className="salon-save-status-dot" aria-hidden="true" />{hasChanges ? 'Unsaved changes' : 'All changes saved'}</div>
    </header>

    <div className="salon-settings-grid">
      <section className="salon-settings-card" aria-labelledby="salon-location-title">
        <div className="salon-settings-card-heading">
          <span className="salon-settings-card-icon salon-settings-card-icon-rose" aria-hidden="true"><Globe2 size={20} strokeWidth={1.8} /></span>
          <div><span className="salon-settings-card-kicker">Location & money</span><h3 id="salon-location-title">Regional setup</h3><p>Choose how the salon displays time and payments.</p></div>
        </div>
        <div className="salon-settings-fields">
          <div className="field salon-setting-field">
            <div className="setting-label-row"><label htmlFor="shop-timezone">Timezone</label><SettingHelp id="shop-timezone-help" label="Timezone" message="Sets the salon's local date and time for opening hours, kiosk availability, daily reports, and timestamps." open={openHelp === 'timezone'} onToggle={() => setOpenHelp(openHelp === 'timezone' ? null : 'timezone')} /></div>
            <div className="salon-field-control"><Globe2 size={17} aria-hidden="true" /><select id="shop-timezone" aria-describedby="shop-timezone-hint" value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)}>{timezoneGroups.map((group) => <optgroup key={group} label={group}>{timezoneOptions.filter((option) => timezoneGroup(option.value) === group).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</select></div>
            <span id="shop-timezone-hint" className="field-hint">Used for opening hours and daily reports.</span>
          </div>
          <div className="field salon-setting-field">
            <div className="setting-label-row"><label htmlFor="shop-currency">Currency</label><SettingHelp id="shop-currency-help" label="Currency" message="Formats new service prices, payments, tips, and reports. It is locked after the first visit so historical amounts stay unambiguous." open={openHelp === 'currency'} onToggle={() => setOpenHelp(openHelp === 'currency' ? null : 'currency')} /></div>
            <div className="salon-field-control"><CircleDollarSign size={17} aria-hidden="true" /><select id="shop-currency" aria-describedby="shop-currency-hint" value={form.currency} onChange={(event) => updateField('currency', event.target.value)}>{currencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <span id="shop-currency-hint" className="field-hint">Used for new service prices, payments, and reports. Locked after the first visit.</span>
          </div>
        </div>
      </section>

      <section className="salon-settings-card" aria-labelledby="salon-hours-title">
        <div className="salon-settings-card-heading">
          <span className="salon-settings-card-icon salon-settings-card-icon-sage" aria-hidden="true"><Clock3 size={20} strokeWidth={1.8} /></span>
          <div><span className="salon-settings-card-kicker">Opening hours</span><h3 id="salon-hours-title">Check-in window</h3><p>Set when customers can join the queue each day.</p></div>
        </div>
        <div className="salon-settings-fields">
          <div className="field salon-setting-field">
            <div className="setting-label-row"><label htmlFor="shop-opening">Opening time</label><SettingHelp id="shop-opening-help" label="Opening time" message="Customer self check-in becomes available at this time in the selected timezone. It must be earlier than closing time." open={openHelp === 'opening'} onToggle={() => setOpenHelp(openHelp === 'opening' ? null : 'opening')} /></div>
            <div className="salon-field-control"><Clock3 size={17} aria-hidden="true" /><input id="shop-opening" aria-describedby="shop-opening-hint" type="time" value={form.openingTime} onChange={(event) => updateField('openingTime', event.target.value)} /></div>
            <span id="shop-opening-hint" className="field-hint">Customer check-in starts at this time.</span>
          </div>
          <div className="field salon-setting-field">
            <div className="setting-label-row"><label htmlFor="shop-closing">Closing time</label><SettingHelp id="shop-closing-help" label="Closing time" message="Customer self check-in stops at this time. Daily closing checks use this time; active services are not automatically cancelled." open={openHelp === 'closing'} onToggle={() => setOpenHelp(openHelp === 'closing' ? null : 'closing')} /></div>
            <div className="salon-field-control"><Clock3 size={17} aria-hidden="true" /><input id="shop-closing" aria-describedby="shop-closing-hint" type="time" value={form.closingTime} onChange={(event) => updateField('closingTime', event.target.value)} /></div>
            <span id="shop-closing-hint" className="field-hint">Customer check-in stops at this time.</span>
          </div>
        </div>
        <div className="salon-hours-summary"><span className="salon-hours-summary-icon" aria-hidden="true"><Clock3 size={16} /></span><div><span>Customer check-in window</span><strong>{formatTimeLabel(form.openingTime)} <em>to</em> {formatTimeLabel(form.closingTime)}</strong></div></div>
      </section>

      <section className="salon-settings-card salon-settings-card-wide" aria-labelledby="salon-queue-title">
        <div className="salon-settings-card-heading">
          <span className="salon-settings-card-icon salon-settings-card-icon-peach" aria-hidden="true"><UsersRound size={20} strokeWidth={1.8} /></span>
          <div><span className="salon-settings-card-kicker">Staff & queue</span><h3 id="salon-queue-title">Assignment behavior</h3><p>Balance staff access and keep station sessions secure.</p></div>
        </div>
        <div className="salon-settings-fields">
          <div className="field salon-setting-field">
            <div className="setting-label-row"><label htmlFor="shop-session-ttl">Staff verification timeout</label><SettingHelp id="shop-session-ttl-help" label="Staff verification timeout" message="How long a staff PIN session stays active at a station. Use 1–15 minutes: shorter is safer, longer reduces repeated PIN entry." open={openHelp === 'session'} onToggle={() => setOpenHelp(openHelp === 'session' ? null : 'session')} /></div>
            <div className="salon-field-control salon-field-control-suffix"><ShieldCheck size={17} aria-hidden="true" /><input id="shop-session-ttl" aria-describedby="shop-session-ttl-hint" type="number" min="1" max="15" value={form.verifiedSessionTtlMin} onChange={(event) => updateField('verifiedSessionTtlMin', Number(event.target.value))} /><span>min</span></div>
            <span id="shop-session-ttl-hint" className="field-hint">Allowed range: 1–15 minutes.</span>
          </div>
          <div className="field salon-setting-field">
            <div className="setting-label-row"><span className="setting-field-label">Balance staff assignments</span><SettingHelp id="shop-round-robin-help" label="Balance staff assignments" message="Yes uses fair turn order based on eligible staff's recent service history. No uses name order. Skills, attendance, availability, and skip rules still apply." open={openHelp === 'roundRobin'} onToggle={() => setOpenHelp(openHelp === 'roundRobin' ? null : 'roundRobin')} /></div>
            <div className="salon-segmented-control" role="group" aria-label="Balance staff assignments" aria-describedby="shop-round-robin-hint">
              <button type="button" className={`salon-segmented-choice ${form.roundRobinEnabled ? 'selected' : ''}`} aria-pressed={form.roundRobinEnabled} onClick={() => updateField('roundRobinEnabled', true)}><span>Yes</span><small>Fair turn order</small></button>
              <button type="button" className={`salon-segmented-choice ${!form.roundRobinEnabled ? 'selected' : ''}`} aria-pressed={!form.roundRobinEnabled} onClick={() => updateField('roundRobinEnabled', false)}><span>No</span><small>Name order</small></button>
            </div>
            <span id="shop-round-robin-hint" className="field-hint">Fair turn order considers each eligible staff member&apos;s recent service history.</span>
          </div>
        </div>
      </section>
    </div>

    {error ? <p className="salon-settings-error form-error" role="alert">{error}</p> : null}
    <div className={`salon-settings-actions ${hasChanges ? 'is-active' : ''}`}>
      <div className="salon-settings-action-copy"><strong>{hasChanges ? 'Review before you save' : 'Your settings are up to date'}</strong><span>{hasChanges ? 'Changes apply to new check-ins and reports.' : 'You can update these values at any time.'}</span></div>
      <div className="salon-settings-action-buttons">
        {hasChanges ? <button type="button" className="button button-quiet" onClick={discardChanges} disabled={saving}><RotateCcw size={16} aria-hidden="true" />Discard</button> : null}
        <button type="button" className="button button-primary" onClick={() => void save()} disabled={saving || !hasChanges} aria-busy={saving}><Check size={16} aria-hidden="true" />{saving ? 'Saving…' : hasChanges ? 'Save changes' : 'Saved'}</button>
      </div>
    </div>
  </div>;
}

function SettingHelp({ id, label, message, open, onToggle }: { id: string; label: string; message: string; open: boolean; onToggle: () => void }) {
  return <span className="setting-help"><button type="button" className="setting-help-trigger" aria-label={`Explain ${label}`} aria-haspopup="true" aria-expanded={open} aria-controls={id} onClick={onToggle}><Info size={17} aria-hidden="true" /></button>{open ? <span id={id} className="setting-help-popover" role="tooltip"><strong>{label}</strong><span>{message}</span></span> : null}</span>;
}
