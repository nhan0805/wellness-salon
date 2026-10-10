'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, BadgeCheck, CalendarClock, ChartNoAxesCombined, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, Clock3, CreditCard, Hand, LayoutDashboard, ListChecks, ListOrdered, Menu, RefreshCcw, Scissors, Search, Settings2, SlidersHorizontal, Sparkles, Tags, UserCog, UsersRound, WalletCards, X } from 'lucide-react';
import { InitialsAvatar, SectionHeader, StatusBadge } from '@/src/components/ui';
import { AdminManagement } from '@/src/components/admin-management';
import { AdminAccessManagement } from '@/src/components/admin-access';
import { SignOutButton } from '@/src/components/sign-out-button';
import { AdminShopConfig, AdminSkipReasons } from '@/src/components/admin-operations';
import { AdminAppointmentAction } from '@/src/components/admin-appointment-actions';
import { useDialogFocus } from '@/src/components/use-dialog-focus';

type Section = 'overview' | 'attendance' | 'queue' | 'appointments' | 'payments' | 'customers' | 'staff' | 'services' | 'skills' | 'skipReasons' | 'accounts' | 'config' | 'reports';
type AppointmentFilter = 'ALL' | 'COMPLETED';
type Appointment = { id: string; code: string; customerName: string; phone: string; serviceId: string; serviceName: string; durationMin: number; amount: number; status: string; primaryStaffId: string | null; primaryStaff: { id: string; name: string; initials: string } | null; completedAt: string | null; createdAt: string; supportingStaffIds: string[]; payment: { method: 'CARD' | 'CASH'; confirmedAt: string } | null; turns: Array<{ status: string; reason: string | null }>; services: Array<{ id: string; serviceId: string; sequence: number; serviceName: string; durationMin: number; amount: number; status: string; primaryStaff: { id: string; name: string; initials: string } | null; turnExclusions: Array<{ staffId: string; staffName: string; reason: string; createdAt: string }> }> };
type ReportPeriod = 'day' | 'month';
type ReportTrendPoint = { date: string; revenue: number; appointmentCount: number; completedCount: number };
type Report = { period: ReportPeriod; businessDate?: string; businessMonth?: string; periodStart: string; periodEnd: string; periodLabel: string; appointmentCount: number; openCount: number; pendingPaymentCount: number; cancelledCount: number; revenue: number; completedCount: number; cardTotal: number; cashTotal: number; byService: Array<{ serviceName: string; revenue: number; count: number }>; byStaff: Array<{ staffName: string; revenue: number; count: number }>; dailyTrend: ReportTrendPoint[]; reconciliation: { recordedTotal: number; difference: number; isBalanced: boolean } };

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [{ id: 'overview', label: 'Dashboard', icon: LayoutDashboard }, { id: 'attendance', label: 'Attendance', icon: CalendarClock }, { id: 'queue', label: 'Queue', icon: ListOrdered }, { id: 'appointments', label: 'Appointments', icon: ClipboardList }, { id: 'payments', label: 'Payments', icon: WalletCards }, { id: 'customers', label: 'Customers', icon: UsersRound }, { id: 'staff', label: 'Staff', icon: BadgeCheck }, { id: 'services', label: 'Services', icon: Hand }, { id: 'skills', label: 'Skills', icon: Tags }, { id: 'skipReasons', label: 'Skip reasons', icon: ListChecks }, { id: 'accounts', label: 'Accounts', icon: UserCog }, { id: 'config', label: 'Shop config', icon: Settings2 }, { id: 'reports', label: 'Reports', icon: ChartNoAxesCombined }];

const emptyReport: Report = { period: 'day', businessDate: '', periodStart: '', periodEnd: '', periodLabel: '', appointmentCount: 0, openCount: 0, pendingPaymentCount: 0, cancelledCount: 0, revenue: 0, completedCount: 0, cardTotal: 0, cashTotal: 0, byService: [], byStaff: [], dailyTrend: [], reconciliation: { recordedTotal: 0, difference: 0, isBalanced: true } };

export default function AdminPage() {
  const [section, setSection] = useState<Section>('overview');
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>('ALL');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reportAppointments, setReportAppointments] = useState<Appointment[]>([]);
  const [report, setReport] = useState<Report>(emptyReport);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('day');
  const [reportDate, setReportDate] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [toast, setToast] = useState('');
  const [paymentModal, setPaymentModal] = useState<Appointment | null>(null);
  const [appointmentAction, setAppointmentAction] = useState<{ appointment: Appointment; mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION' } | null>(null);
  const [method, setMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [tip, setTip] = useState('');
  const [busy, setBusy] = useState(false);
  const [queueRepairing, setQueueRepairing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [shop, setShop] = useState({ timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', currency: 'USD' });

  async function refresh(period = reportPeriod, date = reportDate, month = reportMonth, background = false) {
    if (!background) setLoading(true);
    setLoadError('');
    try {
      const reportQuery = period === 'month'
        ? `?period=month${month ? `&month=${encodeURIComponent(month)}` : ''}`
        : (date ? `?date=${encodeURIComponent(date)}` : '');
      const appointmentsQuery = period === 'month'
        ? `?month=${month ? encodeURIComponent(month) : ''}`
        : (date ? `?date=${encodeURIComponent(date)}` : '');
      const [liveAppointmentsResponse, reportAppointmentsResponse, reportResponse, configResponse] = await Promise.all([
        fetch('/api/admin/appointments', { cache: 'no-store' }),
        fetch(`/api/admin/appointments${appointmentsQuery}`, { cache: 'no-store' }),
        fetch(`/api/admin/reports${reportQuery}`, { cache: 'no-store' }),
        fetch('/api/admin/config', { cache: 'no-store' }),
      ]);
      if (!liveAppointmentsResponse.ok || !reportAppointmentsResponse.ok || !reportResponse.ok || !configResponse.ok) throw new Error('Unable to load dashboard data from the database');
      const [liveAppointmentsPayload, reportAppointmentsPayload, reportPayload, configPayload] = await Promise.all([liveAppointmentsResponse.json(), reportAppointmentsResponse.json(), reportResponse.json(), configResponse.json()]);
      setAppointments(liveAppointmentsPayload.appointments ?? []);
      setReportAppointments(reportAppointmentsPayload.appointments ?? []);
      setReport(reportPayload);
      if (configPayload.shop) setShop(configPayload.shop);
      setLastUpdatedAt(new Date());
      setReportPeriod(reportPayload.period ?? period);
      if (reportPayload.period === 'month') setReportMonth(reportPayload.businessMonth ?? month);
      else setReportDate(reportPayload.businessDate ?? date);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data from the database');
    } finally {
      if (!background) setLoading(false);
    }
  }

  // Load the current business date on mount; period changes are submitted by the filter.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const interval = window.setInterval(() => { void refresh(reportPeriod, reportDate, reportMonth, true); }, 10_000);
    return () => window.clearInterval(interval);
    // refresh is intentionally kept out of the dependency list because it is
    // recreated on render; the selected report scope is the meaningful input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPeriod, reportDate, reportMonth]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const maxServiceRevenue = Math.max(...report.byService.map((entry) => entry.revenue), 1);
  const completionRate = report.appointmentCount ? Math.round((report.completedCount / report.appointmentCount) * 100) : 0;

  function formatMoney(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: shop.currency }).format(value); }
  function openPayment(appointment: Appointment) { setPaymentModal(appointment); setMethod('CARD'); setTip(''); }
  function openAppointmentAction(appointment: Appointment, mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION') { setAppointmentAction({ appointment, mode }); }
  function navigateToSection(nextSection: Section) { setSection(nextSection); if (nextSection === 'appointments') setAppointmentFilter('ALL'); }
  function openAppointments(filter: AppointmentFilter = 'ALL') { setAppointmentFilter(filter); setSection('appointments'); }
  const closePayment = useCallback(() => { setPaymentModal(null); setTip(''); }, []);
  const paymentDialogRef = useDialogFocus(Boolean(paymentModal), closePayment);
  async function confirmPayment() {
    if (!paymentModal) return;
    const parsedTip = tip.trim() ? Number(tip) : 0;
    if (!Number.isFinite(parsedTip) || parsedTip < 0) { setToast('Enter a valid non-negative tip.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/payments/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appointmentId: paymentModal.id, method, tip: parsedTip, idempotencyKey: `payment-${paymentModal.id}-${method}` }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Payment could not be confirmed');
      setToast(`${paymentModal.code} marked paid via ${method === 'CARD' ? 'card' : 'cash'}.`);
      closePayment();
      await refresh();
    } catch (error) { setToast(error instanceof Error ? error.message : 'Payment could not be confirmed'); } finally { setBusy(false); }
  }

  async function repairQueue() {
    setQueueRepairing(true);
    try {
      const response = await fetch('/api/admin/queue/reconcile', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Queue repair could not be completed');
      const routedAppointments = payload.routedAppointments ?? 0;
      setToast(`Queue repair complete · ${routedAppointments} appointment${routedAppointments === 1 ? '' : 's'} reviewed.`);
      await refresh('day', reportDate, reportMonth, true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Queue repair could not be completed');
    } finally {
      setQueueRepairing(false);
    }
  }

  function changeReportPeriod(next: ReportPeriod) { setReportPeriod(next); void refresh(next); }
  function changeReportDate(value: string) { setReportDate(value); if (value) void refresh('day', value, reportMonth); }
  function changeReportMonth(value: string) { setReportMonth(value); if (value) void refresh('month', reportDate, value); }

  function renderOverview() {
    if (loading) return <div className="card management-loading" role="status">Loading dashboard data from the database…</div>;
    if (loadError) return <div className="management-error" role="alert">{loadError}<button className="button button-quiet button-sm" onClick={() => void refresh()}>Retry</button></div>;
    const reportLabel = formatReportPeriodLabel(report);
    const periodName = report.period === 'month' ? 'month' : 'business date';
    return <>
      <div className="dashboard-greeting">
        <div>
          <div className="eyebrow">{report.period === 'month' ? 'Business month' : 'Business date'} · {reportLabel}</div>
          <h2>Operating pulse</h2>
          <p>Database-backed KPIs for the selected {periodName}. Queue activity remains live.</p>
        </div>
        <div className="report-toolbar">
          <ReportPeriodFilter period={reportPeriod} date={reportDate} month={reportMonth} onPeriodChange={changeReportPeriod} onDateChange={changeReportDate} onMonthChange={changeReportMonth} loading={loading} />
        </div>
      </div>
      <div className="kpi-grid">
        <Kpi icon={CircleDollarSign} label="Revenue" value={formatMoney(report.revenue)} meta={`Confirmed payments · ${reportLabel}`} tone="blue" onClick={() => navigateToSection('reports')} actionLabel="Open Reports to review revenue" actionHint="View reports" />
        <Kpi icon={CheckCircle2} label="Completed turns" value={String(report.completedCount)} meta={`${completionRate}% of selected-period appointments`} tone="teal" onClick={() => openAppointments('COMPLETED')} actionLabel="Open completed appointments" actionHint="View completed" />
        <Kpi icon={Clock3} label="Open turns" value={String(report.openCount)} meta={`${report.pendingPaymentCount} payment pending`} tone="orange" onClick={() => navigateToSection('queue')} actionLabel="Open Queue to review active turns" actionHint="Open queue" />
        <Kpi icon={WalletCards} label="Payment split" value={`${Math.round((report.cardTotal / Math.max(report.revenue, 1)) * 100)}% card`} meta={`${formatMoney(report.cashTotal)} cash`} tone="slate" onClick={() => navigateToSection('reports')} actionLabel="Open Reports to review payment split" actionHint="View reports" />
      </div>
      {report.period === 'month' ? <MonthlyTrendCard trend={report.dailyTrend} currency={shop.currency} /> : null}
      <div className="dashboard-grid">
        <section className="card card-pad">
          <div className="card-title-row"><div><h3 className="card-title">Revenue by service</h3><p>Confirmed transactions for {reportLabel}.</p></div><StatusBadge label={report.reconciliation.isBalanced ? 'Balanced' : 'Review'} tone={report.reconciliation.isBalanced ? 'success' : 'warning'} /></div>
          <div className="report-bars">{report.byService.length ? report.byService.map((entry) => <div className="report-bar-row" key={entry.serviceName}><span>{entry.serviceName.replace(' Manicure', '')}</span><div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${(entry.revenue / maxServiceRevenue) * 100}%` }} /></div><strong>{formatMoney(entry.revenue)}</strong></div>) : <div className="empty-state"><span>No confirmed payments for this {periodName}.</span></div>}</div>
          <div className="divider" />
          <div className="reconciliation"><div className="reconciliation-row"><span>System revenue</span><strong>{formatMoney(report.revenue)}</strong></div><div className="reconciliation-row"><span>Card + cash</span><strong>{formatMoney(report.cardTotal + report.cashTotal)}</strong></div><div className="reconciliation-status"><CheckCircle2 size={17} aria-hidden="true" /> Difference {formatMoney(report.reconciliation.difference)}</div></div>
        </section>
        <section className="card card-pad">
          <div className="card-title-row"><div><h3 className="card-title">Recent activity</h3><p>Latest appointments for {reportLabel}.</p></div><button className="button button-quiet button-sm" onClick={() => openAppointments()}>View live queue <ChevronRight size={15} aria-hidden="true" /></button></div>
          <div className="activity-list">{reportAppointments.slice(0, 3).map((appointment) => <ActivityRow key={appointment.id} icon={appointment.payment ? CreditCard : appointment.status === 'COMPLETED' ? CheckCircle2 : Scissors} title={`${appointment.code} · ${appointment.status.replace('_', ' ')}`} detail={`${appointment.serviceName} · ${appointment.customerName}`} amount={formatMoney(appointment.amount)} />)}{!reportAppointments.length ? <div className="empty-state"><span>No appointments for this {periodName}.</span></div> : null}</div>
        </section>
      </div>
    </>;
  }

  function renderSection() { if (section === 'overview') return renderOverview(); if (section === 'queue') return <QueueView appointments={appointments} onPayment={openPayment} onRepair={() => void repairQueue()} repairing={queueRepairing} />; if (section === 'appointments') return <AppointmentsView appointments={reportAppointments} currency={shop.currency} filter={appointmentFilter} reportPeriod={reportPeriod} reportDate={reportDate} reportMonth={reportMonth} onFilterChange={setAppointmentFilter} onPayment={openPayment} onAction={openAppointmentAction} />; if (section === 'payments') return <PaymentsView appointments={appointments} currency={shop.currency} onPayment={openPayment} />; if (section === 'reports') return <ReportsView report={report} currency={shop.currency} reportPeriod={reportPeriod} reportDate={reportDate} reportMonth={reportMonth} onPeriodChange={changeReportPeriod} onDateChange={changeReportDate} onMonthChange={changeReportMonth} loading={loading} />; if (section === 'skills' || section === 'accounts') return <AdminAccessManagement kind={section} onToast={setToast} />; if (section === 'skipReasons') return <AdminSkipReasons onToast={setToast} />; if (section === 'config') return <AdminShopConfig onToast={setToast} />; if (section === 'attendance' || section === 'customers' || section === 'staff' || section === 'services') return <AdminManagement kind={section} currency={shop.currency} onToast={setToast} />; return null; }

  return <main className="admin-layout page-root"><aside className="admin-sidebar"><Link className="brand" href="/"><span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span><span className="brand-copy">Wellness Salon <small>Admin console</small></span></Link><nav className="admin-nav" aria-label="Admin modules"><div className="admin-nav-label">Workspace</div>{navItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={`admin-nav-link ${section === item.id ? 'active' : ''}`} aria-current={section === item.id ? 'page' : undefined} onClick={() => navigateToSection(item.id)}><Icon size={21} strokeWidth={1.8} aria-hidden="true" />{item.label}</button>; })}</nav><div className="admin-sidebar-footer"><div className="subtle">Signed in as</div><div className="table-customer"><InitialsAvatar initials="A" tone="blue" /><div><strong style={{ fontSize: '0.83rem' }}>Administrator</strong><small>Database session</small></div></div><SignOutButton callbackUrl="/admin/sign-in" className="button button-quiet button-sm" /></div></aside><section className="admin-main"><header className="admin-topbar"><div className="admin-topbar-title"><Menu size={20} className="muted" aria-hidden="true" /><h1>{navItems.find((item) => item.id === section)?.label}</h1><span>· Live database</span></div><div className="topbar-actions"><span className="admin-live-status" role="status" aria-live="polite"><span className="admin-live-dot" aria-hidden="true" />{lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Connecting…'}</span><button type="button" className="button button-outline button-sm admin-refresh-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh dashboard data"><RefreshCcw size={17} aria-hidden="true" className={loading ? 'spin' : undefined} /><span>Refresh</span></button><Link className="button button-board-nav" href="/board"><span className="nav-action-icon"><ClipboardList size={18} aria-hidden="true" /></span><span>Open turn board</span><ChevronRight size={17} aria-hidden="true" /></Link></div></header><div className="admin-content">{renderSection()}</div></section>{paymentModal ? <div className="modal-backdrop"><div className="modal" ref={paymentDialogRef} role="dialog" aria-modal="true" aria-labelledby="payment-title"><div className="modal-header"><div><h2 id="payment-title">Confirm payment</h2><p>{paymentModal.code} · {paymentModal.customerName} · {formatMoney(paymentModal.amount)}</p></div><button type="button" className="modal-close" aria-label="Close payment dialog" onClick={closePayment}><X size={19} aria-hidden="true" /></button></div><div className="field"><label htmlFor="payment-method">Method used on merchant terminal</label><select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value as 'CARD' | 'CASH')}><option value="CARD">Card</option><option value="CASH">Cash</option></select></div><div className="field"><label htmlFor="payment-tip">Tip ({shop.currency})</label><input id="payment-tip" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0.00" /><span className="field-hint">Optional. Recorded separately from the service amount.</span></div><p className="field-hint" style={{ marginTop: 12 }}>This records a completed terminal transaction. The app never handles card data.</p><div className="form-actions"><button type="button" className="button button-quiet" onClick={closePayment}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={confirmPayment}>{busy ? 'Confirming…' : 'Confirm & complete'}</button></div></div></div> : null}{appointmentAction ? <AdminAppointmentAction appointment={appointmentAction.appointment} mode={appointmentAction.mode} currency={shop.currency} onClose={() => setAppointmentAction(null)} onComplete={(message) => { setAppointmentAction(null); setToast(message); void refresh(); }} /> : null}{toast ? <div className="toast" role="status"><CheckCircle2 size={17} aria-hidden="true" />{toast}</div> : null}</main>;
}

function Kpi({ icon: Icon, label, value, meta, tone, onClick, actionLabel, actionHint }: { icon: typeof CircleDollarSign; label: string; value: string; meta: string; tone: 'blue' | 'teal' | 'orange' | 'slate'; onClick?: () => void; actionLabel?: string; actionHint?: string }) {
  const content = <><div className="kpi-label"><span>{label}</span><span className={`kpi-icon ${tone === 'teal' ? 'avatar-teal' : tone === 'orange' ? 'avatar-orange' : tone === 'slate' ? 'avatar-slate' : ''}`}><Icon size={17} aria-hidden="true" /></span></div><strong className="kpi-value">{value}</strong><span className="kpi-meta">{meta}</span>{actionHint ? <span className="kpi-action-hint">{actionHint}<ChevronRight size={14} aria-hidden="true" /></span> : null}</>;
  return onClick ? <button type="button" className="card kpi-card kpi-card-action" onClick={onClick} aria-label={actionLabel}>{content}</button> : <div className="card kpi-card">{content}</div>;
}
function ActivityRow({ icon: Icon, title, detail, amount }: { icon: typeof Activity; title: string; detail: string; amount: string }) { return <div className="activity-item"><span className="activity-icon"><Icon size={16} aria-hidden="true" /></span><div className="activity-body"><strong>{title}</strong><small>{detail}</small></div><span className="activity-amount">{amount}</span></div>; }
function formatAdminMoney(value: number, currency: string) { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
function formatBusinessDateLabel(value: string) { if (!value) return 'selected date'; return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
function formatBusinessMonthLabel(value: string) { if (!value) return 'selected month'; return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`)); }
function formatReportPeriodLabel(report: Report) { return report.period === 'month' ? formatBusinessMonthLabel(report.businessMonth ?? report.periodLabel) : formatBusinessDateLabel(report.businessDate ?? report.periodLabel); }
function ReportPeriodFilter({ period, date, month, onPeriodChange, onDateChange, onMonthChange, loading }: { period: ReportPeriod; date: string; month: string; onPeriodChange: (period: ReportPeriod) => void; onDateChange: (value: string) => void; onMonthChange: (value: string) => void; loading: boolean }) {
  const isDay = period === 'day';
  const value = isDay ? date : month;
  return <div className="report-period-filter">
    <div className="period-toggle" role="group" aria-label="Report period">
      <button type="button" className={`button button-sm ${isDay ? 'active' : ''}`} onClick={() => onPeriodChange('day')} aria-pressed={isDay}>Day</button>
      <button type="button" className={`button button-sm ${!isDay ? 'active' : ''}`} onClick={() => onPeriodChange('month')} aria-pressed={!isDay}>Month</button>
    </div>
    <div className="date-filter">
      <label htmlFor={isDay ? 'business-date' : 'business-month'}>{isDay ? 'Business date' : 'Business month'}</label>
      <div className="date-filter-controls">
        <input id={isDay ? 'business-date' : 'business-month'} type={isDay ? 'date' : 'month'} value={value} onChange={(event) => isDay ? onDateChange(event.target.value) : onMonthChange(event.target.value)} required disabled={loading} />
      </div>
    </div>
  </div>;
}
function MonthlyTrendCard({ trend, currency }: { trend: ReportTrendPoint[]; currency: string }) {
  const maxRevenue = Math.max(...trend.map((point) => point.revenue), 1);
  return <section className="card card-pad monthly-trend-card">
    <div className="card-title-row"><div><h3 className="card-title">Monthly trend</h3><p>Revenue and completed activity by business day.</p></div><StatusBadge label={`${trend.length} active day${trend.length === 1 ? '' : 's'}`} tone="neutral" /></div>
    {trend.length ? <div className="monthly-trend" role="img" aria-label="Monthly revenue trend">{trend.map((point) => <div className="monthly-trend-column" key={point.date} title={`${formatBusinessDateLabel(point.date)} · ${formatAdminMoney(point.revenue, currency)} · ${point.appointmentCount} appointments`}><strong>{formatAdminMoney(Math.round(point.revenue), currency)}</strong><div className="monthly-trend-bar-track"><div className="monthly-trend-bar" style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, 4)}%` }} /></div><small>{new Date(`${point.date}T00:00:00Z`).getUTCDate()}</small></div>)}</div> : <div className="empty-state"><span>No appointment activity for this business month.</span></div>}
  </section>;
}
function QueueView({ appointments, onPayment, onRepair, repairing }: { appointments: Appointment[]; onPayment: (appointment: Appointment) => void; onRepair: () => void; repairing: boolean }) {
  return <><SectionHeader eyebrow="Live operations" title="Queue" description="Every active turn, from check-in to payment." action={<button type="button" className="button button-outline button-sm" onClick={onRepair} disabled={repairing}><RefreshCcw size={15} aria-hidden="true" className={repairing ? 'spin' : undefined} />{repairing ? 'Repairing…' : 'Repair assignments'}</button>} /><div className="card card-pad"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Turn</th><th>Customer</th><th>Services</th><th>Assigned</th><th>Status</th><th /></tr></thead><tbody>{appointments.filter((appointment) => !['COMPLETED', 'CANCELLED'].includes(appointment.status)).map((appointment) => {
    const services = appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, sequence: 1, serviceName: appointment.serviceName, durationMin: appointment.durationMin, amount: appointment.amount, status: appointment.status, primaryStaff: appointment.primaryStaff }];
    const totalDuration = services.reduce((total, service) => total + service.durationMin, 0);
    return <tr key={appointment.id}><td><strong>{appointment.code}</strong></td><td><div className="table-customer"><InitialsAvatar initials={appointment.customerName.split(' ').map((part) => part[0]).join('').slice(0, 2)} tone="slate" /><div><strong>{appointment.customerName}</strong><small>{appointment.phone}</small></div></div></td><td><div className="queue-table-service-list">{services.map((service) => <div className="queue-table-service-row" key={service.id}><strong>{service.sequence}. {service.serviceName}</strong><small>{service.durationMin} min</small></div>)}</div><span className="table-note">{services.length} service{services.length === 1 ? '' : 's'} · {totalDuration} min total</span></td><td>{appointment.primaryStaff ? <div className="assigned-staff"><InitialsAvatar initials={appointment.primaryStaff.initials} tone="blue" /><div className="assigned-staff-copy"><strong>{appointment.primaryStaff.name}</strong><small>Assigned specialist</small></div></div> : <span className="subtle">Unassigned</span>}</td><td><StatusBadge label={appointment.status.replace('_', ' ')} tone={appointment.status === 'IN_SERVICE' ? 'blue' : appointment.status === 'PAYMENT_PENDING' ? 'warning' : 'neutral'} /></td><td>{appointment.status === 'PAYMENT_PENDING' ? <button className="button button-primary button-sm" onClick={() => onPayment(appointment)}>Payment</button> : null}</td></tr>;
  })}</tbody></table></div></div></>;
}
function appointmentScopeKey(mode: 'DAY' | 'MONTH' | 'RANGE', date: string, month: string, from: string, to: string) {
  if (mode === 'MONTH') return `MONTH:${month}`;
  if (mode === 'RANGE') return `RANGE:${from}:${to}`;
  return `DAY:${date}`;
}

function AppointmentsView({ appointments, currency, filter, reportPeriod, reportDate, reportMonth, onFilterChange, onPayment, onAction }: { appointments: Appointment[]; currency: string; filter: AppointmentFilter; reportPeriod: ReportPeriod; reportDate: string; reportMonth: string; onFilterChange: (filter: AppointmentFilter) => void; onPayment: (appointment: Appointment) => void; onAction: (appointment: Appointment, mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION') => void }) {
  const [rows, setRows] = useState(appointments);
  const [status, setStatus] = useState(filter);
  const [payment, setPayment] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL');
  const [staffId, setStaffId] = useState('ALL');
  const [serviceId, setServiceId] = useState('ALL');
  const [serviceStatus, setServiceStatus] = useState('ALL');
  const [serviceCount, setServiceCount] = useState<'ALL' | 'SINGLE' | 'MULTI'>('ALL');
  const [sort, setSort] = useState<'NEWEST' | 'OLDEST' | 'AMOUNT_DESC' | 'DURATION_DESC'>('NEWEST');
  const [search, setSearch] = useState('');
  const [dateMode, setDateMode] = useState<'DAY' | 'MONTH' | 'RANGE'>(reportPeriod === 'month' ? 'MONTH' : 'DAY');
  const [dateValue, setDateValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [monthValue, setMonthValue] = useState(reportMonth || new Date().toISOString().slice(0, 7));
  const [fromValue, setFromValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [toValue, setToValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const parentScopeKey = appointmentScopeKey(reportPeriod === 'month' ? 'MONTH' : 'DAY', reportDate || dateValue, reportMonth || monthValue, '', '');
  const [loadedScopeKey, setLoadedScopeKey] = useState(parentScopeKey);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  const dateRequestRef = useRef(0);

  // Keep parent polling from replacing a manually loaded date/month/range with today's rows.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (loadedScopeKey === parentScopeKey) setRows(appointments); }, [appointments, loadedScopeKey, parentScopeKey]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setStatus(filter); }, [filter]);

  const staffOptions = [...new Map(rows.flatMap((appointment) => [appointment.primaryStaff, ...appointment.services.map((service) => service.primaryStaff)]).filter((staff): staff is NonNullable<typeof staff> => Boolean(staff)).map((staff) => [staff.id, staff])).values()].sort((left, right) => left.name.localeCompare(right.name));
  const serviceOptions = [...new Map(rows.flatMap((appointment) => appointment.services.length ? appointment.services.map((service) => ({ id: service.serviceId, name: service.serviceName })) : [{ id: appointment.serviceId, name: appointment.serviceName }]).map((service) => [service.id, service])).values()].sort((left, right) => left.name.localeCompare(right.name));
  const filtered = rows.filter((appointment) => {
    const services = appointment.services.length ? appointment.services : [{ serviceId: appointment.serviceId, status: appointment.status, primaryStaffId: appointment.primaryStaffId }];
    const staffIds = new Set([appointment.primaryStaffId, ...appointment.services.map((service) => service.primaryStaff?.id), ...appointment.supportingStaffIds].filter((id): id is string => Boolean(id)));
    const needle = search.trim().toLocaleLowerCase();
    return (!needle || [appointment.code, appointment.customerName, appointment.phone].some((value) => value.toLocaleLowerCase().includes(needle)))
      && (status === 'ALL' || appointment.status === status)
      && (payment === 'ALL' || (payment === 'PAID' ? Boolean(appointment.payment) : !appointment.payment))
      && (staffId === 'ALL' || (staffId === 'UNASSIGNED' ? staffIds.size === 0 : staffIds.has(staffId)))
      && (serviceId === 'ALL' || services.some((service) => service.serviceId === serviceId))
      && (serviceStatus === 'ALL' || services.some((service) => service.status === serviceStatus))
      && (serviceCount === 'ALL' || (serviceCount === 'MULTI' ? services.length > 1 : services.length === 1));
  }).sort((left, right) => {
    if (sort === 'OLDEST') return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (sort === 'AMOUNT_DESC') return right.amount - left.amount;
    if (sort === 'DURATION_DESC') return (right.services.reduce((total, service) => total + service.durationMin, 0) || right.durationMin) - (left.services.reduce((total, service) => total + service.durationMin, 0) || left.durationMin);
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  const totalRevenue = filtered.reduce((total, appointment) => total + appointment.amount, 0);
  const totalDuration = filtered.reduce((total, appointment) => total + (appointment.services.reduce((sum, service) => sum + service.durationMin, 0) || appointment.durationMin), 0);
  const activeFilterCount = [search, status !== 'ALL' ? status : '', payment !== 'ALL' ? payment : '', staffId !== 'ALL' ? staffId : '', serviceId !== 'ALL' ? serviceId : '', serviceStatus !== 'ALL' ? serviceStatus : '', serviceCount !== 'ALL' ? serviceCount : '', sort !== 'NEWEST' ? sort : ''].filter(Boolean).length;

  function clearFilters() { setSearch(''); setStatus('ALL'); onFilterChange('ALL'); setPayment('ALL'); setStaffId('ALL'); setServiceId('ALL'); setServiceStatus('ALL'); setServiceCount('ALL'); setSort('NEWEST'); }
  async function loadDateScope() {
    if (dateMode === 'RANGE' && (!fromValue || !toValue || fromValue > toValue)) { setDateError('Choose a valid date range.'); return; }
    const requestId = dateRequestRef.current + 1;
    dateRequestRef.current = requestId;
    setDateLoading(true); setDateError('');
    try {
      const query = dateMode === 'MONTH' ? `?month=${encodeURIComponent(monthValue)}` : dateMode === 'RANGE' ? `?from=${encodeURIComponent(fromValue)}&to=${encodeURIComponent(toValue)}` : `?date=${encodeURIComponent(dateValue)}`;
      const response = await fetch(`/api/admin/appointments${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load appointments');
      if (requestId !== dateRequestRef.current) return;
      setRows(payload.appointments ?? []);
      setLoadedScopeKey(appointmentScopeKey(dateMode, dateValue, monthValue, fromValue, toValue));
    } catch (error) { if (requestId === dateRequestRef.current) setDateError(error instanceof Error ? error.message : 'Unable to load appointments'); } finally { if (requestId === dateRequestRef.current) setDateLoading(false); }
  }
  useEffect(() => {
    const shouldLoad = dateMode === 'DAY'
      ? Boolean(dateValue)
      : dateMode === 'MONTH'
        ? Boolean(monthValue)
        : Boolean(fromValue && toValue && fromValue <= toValue);
    // This effect intentionally starts the external history request when the scope changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (shouldLoad) void loadDateScope();
    // The date inputs are the deliberate trigger for this local history query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, dateValue, monthValue, fromValue, toValue]);
  function updateStatus(value: string) { const next = value as AppointmentFilter; setStatus(next); onFilterChange(next === 'COMPLETED' ? 'COMPLETED' : 'ALL'); }

  const periodLabel = dateMode === 'MONTH' ? formatBusinessMonthLabel(monthValue) : dateMode === 'RANGE' ? `${formatBusinessDateLabel(fromValue)} – ${formatBusinessDateLabel(toValue)}` : formatBusinessDateLabel(dateValue);
  return <>
    <SectionHeader eyebrow="History" title="Appointments" description="Search, audit, and sort every appointment. Multi-service visits stay grouped in one record." action={<div className="appointment-period-toolbar"><div className="period-toggle" role="group" aria-label="Appointment date scope"><button type="button" className={`button button-sm ${dateMode === 'DAY' ? 'active' : ''}`} onClick={() => setDateMode('DAY')}>Day</button><button type="button" className={`button button-sm ${dateMode === 'MONTH' ? 'active' : ''}`} onClick={() => setDateMode('MONTH')}>Month</button><button type="button" className={`button button-sm ${dateMode === 'RANGE' ? 'active' : ''}`} onClick={() => setDateMode('RANGE')}>Range</button></div>{dateLoading ? <span className="subtle appointment-date-loading" role="status" aria-live="polite">Loading…</span> : null}</div>} />
    <div className="card card-pad appointment-history-card">
      <div className="appointment-date-fields">
        {dateMode === 'DAY' ? <div className="field"><label htmlFor="appointment-date">Business date</label><input id="appointment-date" type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} /></div> : null}
        {dateMode === 'MONTH' ? <div className="field"><label htmlFor="appointment-month">Business month</label><input id="appointment-month" type="month" value={monthValue} onChange={(event) => setMonthValue(event.target.value)} /></div> : null}
        {dateMode === 'RANGE' ? <><div className="field"><label htmlFor="appointment-from">From</label><input id="appointment-from" type="date" value={fromValue} onChange={(event) => setFromValue(event.target.value)} /></div><div className="field"><label htmlFor="appointment-to">To</label><input id="appointment-to" type="date" value={toValue} onChange={(event) => setToValue(event.target.value)} /></div></> : null}
        <div className="appointment-date-context"><span>Showing</span><strong>{periodLabel}</strong>{dateError ? <small className="form-error">{dateError}</small> : null}</div>
      </div>
      <div className="appointment-filter-grid">
        <div className="field appointment-search-field"><label htmlFor="appointment-search">Search</label><div className="input-with-icon"><Search size={16} aria-hidden="true" /><input id="appointment-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code, customer, phone" /></div></div>
        <div className="field"><label htmlFor="appointment-status">Appointment status</label><select id="appointment-status" value={status} onChange={(event) => updateStatus(event.target.value)}><option value="ALL">All statuses</option>{['CREATED', 'WAITING', 'ASSIGNED', 'IN_SERVICE', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></div>
        <div className="field"><label htmlFor="appointment-payment">Payment</label><select id="appointment-payment" value={payment} onChange={(event) => setPayment(event.target.value as typeof payment)}><option value="ALL">All payments</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid / pending</option></select></div>
        <div className="field"><label htmlFor="appointment-staff">Staff</label><select id="appointment-staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="ALL">All staff</option><option value="UNASSIGNED">Unassigned</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></div>
        <div className="field"><label htmlFor="appointment-service">Service</label><select id="appointment-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="ALL">All services</option>{serviceOptions.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
        <div className="field"><label htmlFor="appointment-service-status">Service status</label><select id="appointment-service-status" value={serviceStatus} onChange={(event) => setServiceStatus(event.target.value)}><option value="ALL">Any service status</option>{['CREATED', 'WAITING', 'ASSIGNED', 'IN_SERVICE', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></div>
        <div className="field"><label htmlFor="appointment-count">Service count</label><select id="appointment-count" value={serviceCount} onChange={(event) => setServiceCount(event.target.value as typeof serviceCount)}><option value="ALL">Single or multi</option><option value="SINGLE">Single service</option><option value="MULTI">Multi-service</option></select></div>
        <div className="field"><label htmlFor="appointment-sort">Sort by</label><select id="appointment-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option><option value="AMOUNT_DESC">Highest amount</option><option value="DURATION_DESC">Longest duration</option></select></div>
      </div>
      <div className="appointment-filter-footer"><div className="appointment-summary"><strong>{filtered.length}</strong> matching · <strong>{formatAdminMoney(totalRevenue, currency)}</strong> revenue · <strong>{totalDuration} min</strong> booked</div><div className="appointment-filter-actions"><span className="subtle"><SlidersHorizontal size={14} aria-hidden="true" />{activeFilterCount ? `${activeFilterCount} filters active` : 'No filters applied'}</span>{activeFilterCount ? <button type="button" className="button button-quiet button-sm" onClick={clearFilters}><X size={15} aria-hidden="true" />Clear</button> : null}</div></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-table appointment-table"><thead><tr><th>Appointment</th><th>Customer</th><th>Services</th><th>Assigned</th><th>Created</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{filtered.map((appointment) => { const services = appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, serviceId: appointment.serviceId, sequence: 1, serviceName: appointment.serviceName, durationMin: appointment.durationMin, amount: appointment.amount, status: appointment.status, primaryStaff: appointment.primaryStaff, turnExclusions: [] }]; const duration = services.reduce((total, service) => total + service.durationMin, 0); const hasEditableService = services.some((service) => !['COMPLETED', 'CANCELLED'].includes(service.status)); const canReassign = services.some((service) => ['WAITING', 'ASSIGNED'].includes(service.status)); const hasExclusion = services.some((service) => service.turnExclusions.length > 0); const canCancel = !['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].includes(appointment.status); return <tr key={appointment.id}><td><strong>{appointment.code}</strong><span className="table-note">{appointment.turns.length} turn record{appointment.turns.length === 1 ? '' : 's'}</span></td><td><div className="table-customer"><InitialsAvatar initials={appointment.customerName.split(' ').map((part) => part[0]).join('').slice(0, 2)} tone="slate" /><div><strong>{appointment.customerName}</strong><small>{appointment.phone}</small></div></div></td><td><div className="history-service-list">{services.map((service) => <div key={service.id}><strong>{service.sequence}. {service.serviceName}</strong><small className="table-note">{service.durationMin} min · {service.status.replace('_', ' ')}{service.turnExclusions.length ? ` · ${service.turnExclusions.length} skip exclusion${service.turnExclusions.length === 1 ? '' : 's'}` : ''}</small></div>)}</div><span className="table-note">{services.length} service{services.length === 1 ? '' : 's'} · {duration} min total</span></td><td>{appointment.primaryStaff ? <div className="assigned-staff"><InitialsAvatar initials={appointment.primaryStaff.initials} tone="blue" /><div className="assigned-staff-copy"><strong>{appointment.primaryStaff.name}</strong><small>Primary assignment</small></div></div> : <span className="subtle">Unassigned</span>}</td><td className="subtle">{formatAppointmentDateTime(appointment.createdAt)}</td><td><StatusBadge label={appointment.status.replace('_', ' ')} tone={appointment.status === 'COMPLETED' ? 'success' : appointment.status === 'CANCELLED' ? 'neutral' : appointment.status === 'IN_SERVICE' ? 'blue' : appointment.status === 'PAYMENT_PENDING' ? 'warning' : 'neutral'} /></td><td><strong>{formatAdminMoney(appointment.amount, currency)}</strong><span className="table-note">{appointment.payment ? 'Paid' : 'Unpaid'}</span></td><td><div className="table-actions">{appointment.status === 'PAYMENT_PENDING' && !appointment.payment ? <button type="button" className="button button-primary button-sm" onClick={() => onPayment(appointment)}>Payment</button> : null}{canCancel ? <button type="button" className="button button-quiet button-sm" onClick={() => onAction(appointment, 'CANCEL')}>Cancel</button> : null}{hasEditableService && !['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].includes(appointment.status) ? <button type="button" className="button button-quiet button-sm" onClick={() => onAction(appointment, 'CHANGE_SERVICE')}>Change service</button> : null}{canReassign ? <button type="button" className="button button-quiet button-sm" onClick={() => onAction(appointment, 'REASSIGN')}>Reassign</button> : null}{hasExclusion ? <button type="button" className="button button-quiet button-sm" onClick={() => onAction(appointment, 'OVERRIDE_EXCLUSION')}>Override skip</button> : null}</div></td></tr>; })}</tbody></table></div> : <div className="empty-state"><CheckCircle2 size={28} aria-hidden="true" /><div><strong>No appointments match</strong><br /><span>Try another date or clear one of the filters.</span></div></div>}
    </div>
  </>;
}
function formatAppointmentDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function PaymentsView({ appointments, currency, onPayment }: { appointments: Appointment[]; currency: string; onPayment: (appointment: Appointment) => void }) { const pending = appointments.filter((appointment) => appointment.status === 'PAYMENT_PENDING' && !appointment.payment); return <><SectionHeader eyebrow="Close the loop" title="Payments" description="Confirm the method after every selected service has been completed." action={<StatusBadge label={`${pending.length} pending`} tone={pending.length ? 'warning' : 'success'} />} /><div className="card card-pad">{pending.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Turn</th><th>Guest</th><th>Services</th><th>Total</th><th /></tr></thead><tbody>{pending.map((appointment) => <tr key={appointment.id}><td><strong>{appointment.code}</strong></td><td>{appointment.customerName}</td><td>{appointment.services.map((service) => service.serviceName).join(' + ')}</td><td><strong>{formatAdminMoney(appointment.amount, currency)}</strong></td><td><button className="button button-primary button-sm" onClick={() => onPayment(appointment)}><CreditCard size={15} aria-hidden="true" /> Confirm</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><CheckCircle2 size={28} aria-hidden="true" /><div><strong>All clear</strong><br /><span>No appointments are waiting for payment.</span></div></div>}</div></>; }
function ReportsView({ report, currency, reportPeriod, reportDate, reportMonth, onPeriodChange, onDateChange, onMonthChange, loading }: { report: Report; currency: string; reportPeriod: ReportPeriod; reportDate: string; reportMonth: string; onPeriodChange: (period: ReportPeriod) => void; onDateChange: (value: string) => void; onMonthChange: (value: string) => void; loading: boolean }) {
  const total = Math.max(report.revenue, 1);
  const reportLabel = formatReportPeriodLabel(report);
  const periodName = report.period === 'month' ? 'business month' : 'business date';
  return <>
    <SectionHeader eyebrow={report.period === 'month' ? 'Monthly performance' : 'End of day'} title="Reports" description={`Operational revenue for ${reportLabel}. Historical periods are loaded from the database.`} action={<div className="report-toolbar"><ReportPeriodFilter period={reportPeriod} date={reportDate} month={reportMonth} onPeriodChange={onPeriodChange} onDateChange={onDateChange} onMonthChange={onMonthChange} loading={loading} /></div>} />
    <div className="kpi-grid">
      <Kpi icon={CircleDollarSign} label="Revenue" value={formatAdminMoney(report.revenue, currency)} meta="System total" tone="blue" />
      <Kpi icon={CreditCard} label="Card" value={formatAdminMoney(report.cardTotal, currency)} meta={`${Math.round((report.cardTotal / total) * 100)}% of total`} tone="teal" />
      <Kpi icon={WalletCards} label="Cash" value={formatAdminMoney(report.cashTotal, currency)} meta={`${Math.round((report.cashTotal / total) * 100)}% of total`} tone="orange" />
      <Kpi icon={CheckCircle2} label="Difference" value={formatAdminMoney(report.reconciliation.difference, currency)} meta="Must remain zero" tone="slate" />
    </div>
    {report.period === 'month' ? <MonthlyTrendCard trend={report.dailyTrend} currency={currency} /> : null}
    <div className="dashboard-grid">
      <div className="card card-pad"><h3 className="card-title">Revenue by staff</h3><p className="subtle" style={{ marginTop: 5 }}>Transaction attribution for operations only — no ranking.</p>{report.byStaff.length ? <div className="admin-table-wrap report-staff-table-wrap" style={{ marginTop: 20 }}><table className="admin-table report-staff-table"><thead><tr><th>Staff</th><th>Completed turns</th><th>Revenue</th></tr></thead><tbody>{report.byStaff.map((entry) => <tr key={entry.staffName}><td>{entry.staffName}</td><td>{entry.count}</td><td><strong>{formatAdminMoney(entry.revenue, currency)}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><span>No confirmed payments for this {periodName}.</span></div>}</div>
      <div className="card card-pad"><h3 className="card-title">Reconciliation</h3><p className="subtle" style={{ marginTop: 5 }}>System revenue = card + cash.</p><div className="reconciliation" style={{ marginTop: 24 }}><div className="reconciliation-row"><span>System revenue</span><strong>{formatAdminMoney(report.revenue, currency)}</strong></div><div className="reconciliation-row"><span>Card</span><strong>{formatAdminMoney(report.cardTotal, currency)}</strong></div><div className="reconciliation-row"><span>Cash</span><strong>{formatAdminMoney(report.cashTotal, currency)}</strong></div><div className="reconciliation-status"><CheckCircle2 size={17} aria-hidden="true" />{report.reconciliation.isBalanced ? `Balanced · difference ${formatAdminMoney(0, currency)}` : 'Review difference'}</div></div></div>
    </div>
  </>;
}
