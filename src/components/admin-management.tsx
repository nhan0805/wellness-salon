'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Archive, BadgeCheck, CalendarClock, Edit3, History, LoaderCircle, Plus, RefreshCcw, RotateCcw, Scissors, Trash2, Users, X } from 'lucide-react';
import { InitialsAvatar, SectionHeader, StatusBadge } from '@/src/components/ui';
import { DEFAULT_SERVICE_ICON_KEY, type ServiceIconKey } from '@/src/domain/service-icons';
import { ServiceIcon, ServiceIconPicker } from '@/src/components/service-icons';

type ManagementKind = 'attendance' | 'customers' | 'staff' | 'services';
type Attendance = { staffId: string; staffName: string; initials: string; isActive: boolean; status: 'PRESENT' | 'CHECKED_OUT' | 'ABSENT'; availability: 'AVAILABLE' | 'BUSY'; checkInAt: string | null; checkOutAt: string | null; closedBy: 'STAFF' | 'ADMIN' | 'AUTO' | null };
type Customer = { id: string; name: string; phone: string; appointmentCount: number; lastVisitAt: string | null; createdAt: string; updatedAt: string };
type Skill = { id: string; name: string };
type Staff = { id: string; name: string; initials: string; skills: Skill[]; isActive: boolean; status: Attendance['status']; availability: Attendance['availability']; checkInAt: string | null; checkOutAt: string | null };
type Service = { id: string; name: string; iconKey: ServiceIconKey; durationMin: number; price: number; requiredSkills: Skill[]; isActive: boolean; appointmentCount: number; createdAt: string; updatedAt: string };
type CustomerHistoryStatus = 'CREATED' | 'WAITING' | 'ASSIGNED' | 'IN_SERVICE' | 'PAYMENT_PENDING' | 'COMPLETED';
type CustomerHistoryItem = { id: string; code: string; businessDate: string; createdAt: string; completedAt: string | null; serviceName: string; durationMin: number; staffName: string | null; status: CustomerHistoryStatus; amount: number; services: Array<{ id: string; sequence: number; serviceName: string; durationMin: number; amount: number; status: CustomerHistoryStatus; staffName: string | null }>; payment: { amount: number; tip: number; total: number; method: 'CARD' | 'CASH'; confirmedAt: string } | null };
type CustomerHistoryPayload = { customer: { id: string; name: string; phone: string }; summary: { visitCount: number; completedCount: number; paidTotal: number; tipTotal: number }; history: CustomerHistoryItem[] };

type CustomerForm = { name: string; phone: string };
type StaffForm = { name: string; pin: string; skillIds: string[]; isActive: boolean };
type ServiceForm = { name: string; iconKey: ServiceIconKey; durationMin: string; price: string; skillIds: string[]; isActive: boolean };
type ModalState =
  | { type: 'customer'; record?: Customer }
  | { type: 'staff'; record?: Staff }
  | { type: 'service'; record?: Service }
  | null;

const endpointByKind: Record<ManagementKind, string> = { attendance: '/api/admin/attendance', customers: '/api/admin/customers', staff: '/api/admin/staff', services: '/api/admin/services' };
const historyStatusOptions: Array<{ value: CustomerHistoryStatus; label: string }> = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAYMENT_PENDING', label: 'Payment pending' },
  { value: 'IN_SERVICE', label: 'In service' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'CREATED', label: 'Created' },
];
export function AdminManagement({ kind, onToast }: { kind: ManagementKind; onToast: (message: string) => void }) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(endpointByKind[kind], { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load this module');
      if (kind === 'attendance') setAttendance(payload.attendance ?? []);
      if (kind === 'customers') setCustomers(payload.customers ?? []);
      if (kind === 'staff') { setStaff(payload.staff ?? []); setSkills(payload.skills ?? []); }
      if (kind === 'services') { setServices(payload.services ?? []); setSkills(payload.skills ?? []); }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this module');
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

  async function submit(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, message = 'Saved') {
    setBusy(true);
    setFormError('');
    try {
      await request(path, method, body);
      setModal(null);
      onToast(message);
      await load();
      return true;
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'The operation could not be completed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateAttendance(record: Attendance) {
    setBusyId(record.staffId);
    setError('');
    try {
      await request(endpointByKind.attendance, 'POST', { staffId: record.staffId, action: record.status === 'PRESENT' ? 'CHECK_OUT' : 'CHECK_IN', idempotencyKey: `admin-attendance-${record.staffId}-${record.status === 'PRESENT' ? 'out' : 'in'}-${Date.now()}` });
      onToast(`${record.staffName} is now ${record.status === 'PRESENT' ? 'checked out' : 'checked in'}.`);
      await load();
    } catch (attendanceError) {
      setError(attendanceError instanceof Error ? attendanceError.message : 'Unable to update attendance');
    } finally {
      setBusyId(null);
    }
  }

  async function runClosing() {
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/jobs/closing', 'POST');
      const closedCount = typeof result.closedCount === 'number' ? result.closedCount : 0;
      const deferredCount = typeof result.deferredCount === 'number' ? result.deferredCount : 0;
      onToast(deferredCount ? `Closing review completed. ${closedCount} staff checked out; ${deferredCount} remain checked in until payment is completed.` : `Closing review completed. ${closedCount} staff checked out.`);
      await load();
    } catch (closingError) {
      setError(closingError instanceof Error ? closingError.message : 'Unable to run closing review');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomer(record: Customer) {
    if (record.appointmentCount > 0 || !window.confirm(`Delete ${record.name}? This cannot be undone.`)) return;
    await submit(`${endpointByKind.customers}?id=${encodeURIComponent(record.id)}`, 'DELETE', undefined, `${record.name} deleted.`);
  }

  async function toggleStaff(record: Staff) {
    await submit(endpointByKind.staff, 'PATCH', { id: record.id, name: record.name, pin: '', skillIds: record.skills.map((skill) => skill.id), isActive: !record.isActive }, record.isActive ? `${record.name} deactivated.` : `${record.name} reactivated.`);
  }

  async function archiveService(record: Service) {
    if (!window.confirm(`Archive ${record.name} from the kiosk catalog?`)) return;
    await submit(`${endpointByKind.services}?id=${encodeURIComponent(record.id)}`, 'DELETE', undefined, `${record.name} archived.`);
  }

  function openModal(next: ModalState) {
    setFormError('');
    setModal(next);
  }

  const title = kind === 'attendance' ? 'Attendance' : kind === 'customers' ? 'Customers' : kind === 'staff' ? 'Staff' : 'Services';
  const description = kind === 'attendance' ? 'Check-in, check-out, and automatic closing-time review. Only checked-in staff can receive turns.' : kind === 'customers' ? 'Guest profiles used to recognize repeat visits.' : kind === 'staff' ? 'Skills, PIN access, attendance, availability, and staff lifecycle.' : 'The active catalog shown on the customer kiosk. Each service can require multiple skills.';

  return <>
    <SectionHeader eyebrow="Admin module" title={title} description={description} action={kind === 'attendance' ? <button className="button button-outline button-sm" onClick={runClosing} disabled={busy}><RefreshCcw size={15} aria-hidden="true" /> Run closing review</button> : <button className="button button-primary button-sm" onClick={() => openModal(kind === 'customers' ? { type: 'customer' } : kind === 'staff' ? { type: 'staff' } : { type: 'service' })} disabled={loading || busy}><Plus size={15} aria-hidden="true" /> Add record</button>} />
    {error ? <div className="management-error" role="alert"><X size={17} aria-hidden="true" />{error}<button className="button button-quiet button-sm" onClick={() => void load()}>Retry</button></div> : null}
    {loading ? <div className="card management-loading" role="status"><LoaderCircle size={22} className="spin" aria-hidden="true" /> Loading {title.toLowerCase()}…</div> : <div className="card card-pad management-card">{kind === 'attendance' ? <AttendanceTable rows={attendance} busyId={busyId} onToggle={updateAttendance} /> : null}{kind === 'customers' ? <CustomersTable rows={customers} onEdit={(record) => openModal({ type: 'customer', record })} onDelete={deleteCustomer} onHistory={setHistoryCustomer} /> : null}{kind === 'staff' ? <StaffTable rows={staff} onEdit={(record) => openModal({ type: 'staff', record })} onToggle={toggleStaff} /> : null}{kind === 'services' ? <ServicesTable rows={services} onEdit={(record) => openModal({ type: 'service', record })} onArchive={archiveService} /> : null}</div>}
    {historyCustomer ? <CustomerHistoryModal customer={historyCustomer} onClose={() => setHistoryCustomer(null)} /> : null}
    {modal?.type === 'customer' ? <RecordModal title={modal.record ? 'Edit customer' : 'Add customer'} description="Keep the phone number accurate so kiosk check-in can recognize the guest." error={formError} onClose={() => setModal(null)}><CustomerForm record={modal.record} busy={busy} onCancel={() => setModal(null)} onSubmit={(values) => submit(endpointByKind.customers, modal.record ? 'PATCH' : 'POST', modal.record ? { ...values, id: modal.record.id } : values, modal.record ? 'Customer updated.' : 'Customer added.')} /></RecordModal> : null}
    {modal?.type === 'staff' ? <RecordModal title={modal.record ? 'Edit staff member' : 'Add staff member'} description="Initials are generated from the name. Staff must have at least one skill before they can receive a turn." error={formError} wide onClose={() => setModal(null)}><StaffForm record={modal.record} skills={skills} busy={busy} onCancel={() => setModal(null)} onSubmit={(values) => submit(endpointByKind.staff, modal.record ? 'PATCH' : 'POST', modal.record ? { ...values, id: modal.record.id } : values, modal.record ? 'Staff member updated.' : 'Staff member added.')} /></RecordModal> : null}
    {modal?.type === 'service' ? <RecordModal title={modal.record ? 'Edit service' : 'Add service'} description="Active services appear on the kiosk. Staff must have every selected skill; check-in and availability still decide assignment priority." error={formError} wide onClose={() => setModal(null)}><ServiceForm record={modal.record} skills={skills} busy={busy} onCancel={() => setModal(null)} onSubmit={(values) => submit(endpointByKind.services, modal.record ? 'PATCH' : 'POST', modal.record ? { ...values, id: modal.record.id, durationMin: Number(values.durationMin), price: Number(values.price) } : { ...values, durationMin: Number(values.durationMin), price: Number(values.price) }, modal.record ? 'Service updated.' : 'Service added.')} /></RecordModal> : null}
  </>;
}

function AttendanceTable({ rows, busyId, onToggle }: { rows: Attendance[]; busyId: string | null; onToggle: (record: Attendance) => void }) {
  if (!rows.length) return <EmptyState icon={CalendarClock} title="No staff records" description="Add staff members before managing attendance." />;
  return <div className="admin-table-wrap"><table className="admin-table management-table"><caption className="sr-only">Staff attendance for today</caption><thead><tr><th>Staff</th><th>Presence</th><th>Availability</th><th>Check-in</th><th>Check-out</th><th /></tr></thead><tbody>{rows.map((row) => {
    const availability = availabilityPresentation(row.status, row.availability);
    return <tr key={row.staffId}><td><div className="table-customer"><InitialsAvatar initials={row.initials} tone="blue" /><div><strong>{row.staffName}</strong><small>{row.isActive ? 'Active staff' : 'Inactive staff'}</small></div></div></td><td><StatusBadge label={row.status === 'PRESENT' ? 'Present' : row.status === 'CHECKED_OUT' ? 'Checked out' : 'Not checked in'} tone={row.status === 'PRESENT' ? 'success' : row.status === 'CHECKED_OUT' ? 'neutral' : 'warning'} /></td><td><StatusBadge label={availability.label} tone={availability.tone} /></td><td className="subtle">{formatDateTime(row.checkInAt)}</td><td className="subtle">{formatDateTime(row.checkOutAt)}{row.closedBy ? <small className="table-note">via {row.closedBy.toLowerCase()}</small> : null}</td><td>{row.isActive ? <button className="button button-outline button-sm" onClick={() => onToggle(row)} disabled={busyId === row.staffId}>{busyId === row.staffId ? 'Saving…' : row.status === 'PRESENT' ? 'Check out' : 'Check in'}</button> : <span className="subtle">Inactive</span>}</td></tr>;
  })}</tbody></table></div>;
}

function CustomerHistoryModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [data, setData] = useState<CustomerHistoryPayload | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<CustomerHistoryStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (filters: { from: string; to: string; status: CustomerHistoryStatus | '' } = { from, to, status }) => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams();
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
    if (filters.status) query.set('status', filters.status);
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(customer.id)}/history${query.toString() ? `?${query.toString()}` : ''}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load customer history');
      setData(payload);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Unable to load customer history');
    } finally {
      setLoading(false);
    }
  }, [customer.id, from, status, to]);

  // Load the complete history once when a customer history modal opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { void load({ from: '', to: '', status: '' }); }, 0); return () => window.clearTimeout(timer); }, [customer.id]);

  function resetFilters() {
    setFrom('');
    setTo('');
    setStatus('');
    void load({ from: '', to: '', status: '' });
  }

  return <RecordModal title="Customer history" description={`${customer.name} · ${customer.phone}`} error={error} wide onClose={onClose}>
    <form className="history-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <div className="field"><label htmlFor="history-from">From</label><input id="history-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
      <div className="field"><label htmlFor="history-to">To</label><input id="history-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
      <div className="field"><label htmlFor="history-status">Status</label><select id="history-status" value={status} onChange={(event) => setStatus(event.target.value as CustomerHistoryStatus | '')}><option value="">All statuses</option>{historyStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="history-filter-actions"><button className="button button-primary button-sm" type="submit" disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</button><button className="button button-quiet button-sm" type="button" onClick={resetFilters} disabled={loading}>Clear</button></div>
    </form>
    {loading && !data ? <div className="management-loading" role="status"><LoaderCircle size={22} className="spin" aria-hidden="true" /> Loading history…</div> : data ? <>
      <div className="history-summary" aria-label="Customer history summary"><div className="history-stat"><span>Visits</span><strong>{data.summary.visitCount}</strong></div><div className="history-stat"><span>Paid</span><strong>${data.summary.paidTotal.toFixed(2)}</strong><small>{data.summary.completedCount} completed</small></div><div className="history-stat"><span>Tips</span><strong>${data.summary.tipTotal.toFixed(2)}</strong></div></div>
      {data.history.length ? <div className="admin-table-wrap history-table-wrap"><table className="admin-table history-table"><caption className="sr-only">Transaction history for {customer.name}</caption><thead><tr><th>Date</th><th>Visit</th><th>Services</th><th>Status</th><th>Payment</th></tr></thead><tbody>{data.history.map((item) => <tr key={item.id}><td className="subtle">{formatHistoryDate(item.businessDate)}<small className="table-note">{formatDateTime(item.createdAt)}</small></td><td><strong>{item.code}</strong><small className="table-note">{item.services.length} service{item.services.length === 1 ? '' : 's'}</small></td><td><div className="history-service-list">{item.services.map((service) => <div key={service.id}><strong>{service.serviceName}</strong><small className="table-note">{service.durationMin} min · ${service.amount.toFixed(2)}{service.staffName ? ` · ${service.staffName}` : ''}</small></div>)}</div></td><td><StatusBadge label={formatStatus(item.status)} tone={historyStatusTone(item.status)} /></td><td>{item.payment ? <><strong>${item.payment.total.toFixed(2)}</strong><small className="table-note">{item.payment.method === 'CARD' ? 'Card' : 'Cash'}{item.payment.tip ? ` · $${item.payment.tip.toFixed(2)} tip` : ''}</small></> : <span className="subtle">Not paid</span>}</td></tr>)}</tbody></table></div> : <div className="history-empty"><History size={24} aria-hidden="true" /><strong>No transactions match these filters.</strong><span>Try a different date range or status.</span></div>}
    </> : null}
  </RecordModal>;
}

function CustomersTable({ rows, onEdit, onDelete, onHistory }: { rows: Customer[]; onEdit: (record: Customer) => void; onDelete: (record: Customer) => void; onHistory: (record: Customer) => void }) {
  if (!rows.length) return <EmptyState icon={Users} title="No customers yet" description="Add a guest profile or let the kiosk create one at check-in." />;
  return <div className="admin-table-wrap"><table className="admin-table management-table"><caption className="sr-only">Customer records</caption><thead><tr><th>Customer</th><th>Phone</th><th>Visits</th><th>Last visit</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="table-customer"><InitialsAvatar initials={initialsFor(row.name)} tone="slate" /><div><strong>{row.name}</strong><small>Added {formatDate(row.createdAt)}</small></div></div></td><td>{row.phone}</td><td>{row.appointmentCount}</td><td className="subtle">{formatDate(row.lastVisitAt)}</td><td><div className="table-actions"><button className="button button-quiet button-sm" onClick={() => onHistory(row)}><History size={15} aria-hidden="true" /> History</button><button className="button button-quiet button-sm" onClick={() => onEdit(row)}><Edit3 size={15} aria-hidden="true" /> Edit</button><button className="button button-quiet button-sm" onClick={() => onDelete(row)} disabled={row.appointmentCount > 0} title={row.appointmentCount > 0 ? 'Customers with appointment history cannot be deleted' : 'Delete customer'}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></td></tr>)}</tbody></table></div>;
}

function StaffTable({ rows, onEdit, onToggle }: { rows: Staff[]; onEdit: (record: Staff) => void; onToggle: (record: Staff) => void }) {
  if (!rows.length) return <EmptyState icon={BadgeCheck} title="No staff yet" description="Add your first staff member with skills and a PIN." />;
  return <div className="admin-table-wrap"><table className="admin-table management-table"><caption className="sr-only">Staff records</caption><thead><tr><th>Staff</th><th>Skills</th><th>Presence</th><th>Availability</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => {
    const availability = availabilityPresentation(row.status, row.availability);
    return <tr key={row.id}><td><div className="table-customer"><InitialsAvatar initials={row.initials} tone="blue" /><div><strong>{row.name}</strong><small>{row.initials}</small></div></div></td><td><div className="tag-list">{row.skills.map((skill) => <span className="tag" key={skill.id}>{skill.name}</span>)}</div></td><td><StatusBadge label={row.status === 'PRESENT' ? 'Present' : row.status === 'CHECKED_OUT' ? 'Checked out' : 'Not checked in'} tone={row.status === 'PRESENT' ? 'success' : 'neutral'} /></td><td><StatusBadge label={availability.label} tone={availability.tone} /></td><td><StatusBadge label={row.isActive ? 'Active' : 'Inactive'} tone={row.isActive ? 'success' : 'neutral'} /></td><td><div className="table-actions"><button className="button button-quiet button-sm" onClick={() => onEdit(row)}><Edit3 size={15} aria-hidden="true" /> Edit</button><button className="button button-quiet button-sm" onClick={() => onToggle(row)}>{row.isActive ? <><Archive size={15} aria-hidden="true" /> Deactivate</> : <><RotateCcw size={15} aria-hidden="true" /> Reactivate</>}</button></div></td></tr>;
  })}</tbody></table></div>;
}

function ServicesTable({ rows, onEdit, onArchive }: { rows: Service[]; onEdit: (record: Service) => void; onArchive: (record: Service) => void }) {
  if (!rows.length) return <EmptyState icon={Scissors} title="No services yet" description="Add a service to make it available on the kiosk." />;
  return <div className="admin-table-wrap"><table className="admin-table management-table"><caption className="sr-only">Service catalog</caption><thead><tr><th className="service-icon-column" scope="col">Icon</th><th>Service</th><th>Duration</th><th>Price</th><th>Required skills</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="service-icon-cell"><span className="service-table-icon"><ServiceIcon iconKey={row.iconKey} size={20} aria-hidden="true" /></span></td><td><strong>{row.name}</strong><small className="table-note">{row.appointmentCount} appointment{row.appointmentCount === 1 ? '' : 's'}</small></td><td>{row.durationMin} min</td><td><strong>${row.price.toFixed(2)}</strong></td><td><div className="tag-list">{row.requiredSkills.map((skill) => <span className="tag" key={skill.id}>{skill.name}</span>)}</div></td><td><StatusBadge label={row.isActive ? 'Active' : 'Archived'} tone={row.isActive ? 'success' : 'neutral'} /></td><td><div className="table-actions"><button className="button button-quiet button-sm" onClick={() => onEdit(row)}><Edit3 size={15} aria-hidden="true" /> Edit</button>{row.isActive ? <button className="button button-quiet button-sm" onClick={() => onArchive(row)}><Archive size={15} aria-hidden="true" /> Archive</button> : null}</div></td></tr>)}</tbody></table></div>;
}

function CustomerForm({ record, busy, onCancel, onSubmit }: { record?: Customer; busy: boolean; onCancel: () => void; onSubmit: (values: CustomerForm) => Promise<boolean> }) {
  const [values, setValues] = useState<CustomerForm>({ name: record?.name ?? '', phone: record?.phone ?? '' });
  return <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await onSubmit(values); }}><div className="admin-form-grid"><div className="field"><label htmlFor="customer-name">Full name</label><input id="customer-name" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} autoComplete="name" required minLength={2} maxLength={80} /></div><div className="field"><label htmlFor="customer-phone">Mobile number</label><input id="customer-phone" type="tel" inputMode="tel" value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} autoComplete="tel" required minLength={7} maxLength={20} /></div></div><div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : 'Add customer'}</button></div></form>;
}

function StaffForm({ record, skills, busy, onCancel, onSubmit }: { record?: Staff; skills: Skill[]; busy: boolean; onCancel: () => void; onSubmit: (values: StaffForm) => Promise<boolean> }) {
  const [values, setValues] = useState<StaffForm>({ name: record?.name ?? '', pin: '', skillIds: record?.skills.map((skill) => skill.id) ?? [], isActive: record?.isActive ?? true });
  const [localError, setLocalError] = useState('');
  const toggleSkill = (skillId: string) => setValues((current) => ({ ...current, skillIds: current.skillIds.includes(skillId) ? current.skillIds.filter((id) => id !== skillId) : [...current.skillIds, skillId] }));
  return <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); if (!values.skillIds.length) { setLocalError('Choose at least one skill.'); return; } setLocalError(''); await onSubmit(values); }}><div className="admin-form-grid admin-form-grid-two"><div className="field"><label htmlFor="staff-name">Full name</label><input id="staff-name" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} autoComplete="name" required minLength={2} maxLength={80} /></div><div className="field"><label htmlFor="staff-pin">{record ? 'New PIN (optional)' : '4-digit PIN'}</label><input id="staff-pin" type="password" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={values.pin} onChange={(event) => setValues({ ...values, pin: event.target.value.replace(/\D/g, '').slice(0, 4) })} autoComplete="new-password" minLength={record ? 0 : 4} maxLength={4} required={!record} placeholder={record ? 'Leave blank to keep the current PIN.' : '••••'} /></div></div><fieldset className="skill-fieldset"><legend>Skills</legend><div className="checkbox-grid">{skills.map((skill) => <label className="checkbox-option" key={skill.id}><input type="checkbox" checked={values.skillIds.includes(skill.id)} onChange={() => toggleSkill(skill.id)} /><span>{skill.name}</span></label>)}</div></fieldset>{record ? <label className="checkbox-option"><input type="checkbox" checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} /><span>Available for new assignments</span></label> : null}{localError ? <p className="form-error" role="alert">{localError}</p> : null}<div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : 'Add staff member'}</button></div></form>;
}

function ServiceForm({ record, skills, busy, onCancel, onSubmit }: { record?: Service; skills: Skill[]; busy: boolean; onCancel: () => void; onSubmit: (values: ServiceForm) => Promise<boolean> }) {
  const [values, setValues] = useState<ServiceForm>({ name: record?.name ?? '', iconKey: record?.iconKey ?? DEFAULT_SERVICE_ICON_KEY, durationMin: String(record?.durationMin ?? 30), price: String(record?.price ?? 20), skillIds: record?.requiredSkills.map((skill) => skill.id) ?? (skills[0] ? [skills[0].id] : []), isActive: record?.isActive ?? true });
  const [localError, setLocalError] = useState('');
  const toggleSkill = (skillId: string) => setValues((current) => ({ ...current, skillIds: current.skillIds.includes(skillId) ? current.skillIds.filter((id) => id !== skillId) : [...current.skillIds, skillId] }));
  return <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); if (!values.skillIds.length) { setLocalError('Choose at least one required skill.'); return; } setLocalError(''); await onSubmit(values); }}><div className="admin-form-grid admin-form-grid-two"><div className="field"><label htmlFor="service-name">Service name</label><input id="service-name" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required minLength={2} maxLength={80} /></div><div className="field"><label htmlFor="service-duration">Duration (minutes)</label><input id="service-duration" type="number" min="5" max="480" step="5" value={values.durationMin} onChange={(event) => setValues({ ...values, durationMin: event.target.value })} required /></div><div className="field"><label htmlFor="service-price">Price (USD)</label><input id="service-price" type="number" min="0" max="100000" step="0.01" value={values.price} onChange={(event) => setValues({ ...values, price: event.target.value })} required /></div></div><fieldset className="skill-fieldset service-skill-fieldset"><legend>Required skills</legend><span className="field-hint">A staff member must have every selected skill. Check-in and availability still decide priority.</span><div className="checkbox-grid">{skills.map((skill) => <label className="checkbox-option" key={skill.id}><input type="checkbox" checked={values.skillIds.includes(skill.id)} onChange={() => toggleSkill(skill.id)} /><span>{skill.name}</span></label>)}</div></fieldset>{record ? <label className="checkbox-option"><input type="checkbox" checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} /><span>Visible on kiosk</span></label> : null}<ServiceIconPicker value={values.iconKey} onChange={(iconKey) => setValues({ ...values, iconKey })} />{localError ? <p className="form-error" role="alert">{localError}</p> : null}<div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : 'Add service'}</button></div></form>;
}

function RecordModal({ title, description, error, wide = false, onClose, children }: { title: string; description: string; error: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [onClose]);
  return <div className="modal-backdrop"><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="record-modal-title"><div className="modal-header"><div><h2 id="record-modal-title" tabIndex={-1} ref={headingRef}>{title}</h2><p>{description}</p></div><button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={19} aria-hidden="true" /></button></div>{error ? <div className="management-error modal-error" role="alert">{error}</div> : null}{children}</div></div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Users; title: string; description: string }) {
  return <div className="empty-state"><Icon size={28} aria-hidden="true" /><div><strong>{title}</strong><br /><span>{description}</span></div></div>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
}

function formatDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}

function availabilityPresentation(status: Attendance['status'], availability: Attendance['availability']) {
  if (status !== 'PRESENT') return { label: 'Not available', tone: 'neutral' as const };
  return availability === 'BUSY' ? { label: 'Busy', tone: 'blue' as const } : { label: 'Available', tone: 'success' as const };
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function formatStatus(value: CustomerHistoryStatus) {
  return value.replaceAll('_', ' ');
}

function historyStatusTone(value: CustomerHistoryStatus): 'success' | 'warning' | 'blue' | 'neutral' {
  if (value === 'COMPLETED') return 'success';
  if (value === 'PAYMENT_PENDING') return 'warning';
  if (value === 'IN_SERVICE') return 'blue';
  return 'neutral';
}

function initialsFor(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
