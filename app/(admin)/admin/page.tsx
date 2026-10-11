'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Banknote, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Clock3, CreditCard, Hand, History, LayoutDashboard, ListChecks, ListOrdered, Menu, MoreHorizontal, Pencil, RefreshCcw, Scissors, Search, Settings2, SlidersHorizontal, Sparkles, Tags, Undo2, UserCog, UsersRound, WalletCards, X } from 'lucide-react';
import { InitialsAvatar, SectionHeader, StatusBadge } from '@/src/components/ui';
import { AdminManagement } from '@/src/components/admin-management';
import { AdminAccessManagement } from '@/src/components/admin-access';
import { SignOutButton } from '@/src/components/sign-out-button';
import { AdminShopConfig, AdminSkipReasons } from '@/src/components/admin-operations';
import { AdminAppointmentAction } from '@/src/components/admin-appointment-actions';
import { useDialogFocus } from '@/src/components/use-dialog-focus';

type Section = 'overview' | 'attendance' | 'queue' | 'appointments' | 'payments' | 'customers' | 'config';
type ShopConfigSection = 'general' | 'staff' | 'services' | 'skills' | 'skipReasons' | 'accounts';
type AppointmentFilter = 'ALL' | 'COMPLETED';
type AppointmentStatusFilter = 'ALL' | 'CREATED' | 'WAITING' | 'ASSIGNED' | 'IN_SERVICE' | 'PAYMENT_PENDING' | 'COMPLETED' | 'CANCELLED';
type AppointmentDateMode = 'DAY' | 'MONTH' | 'RANGE';
type Appointment = { id: string; code: string; customerName: string; phone: string; serviceId: string; serviceName: string; durationMin: number; amount: number; status: string; primaryStaffId: string | null; primaryStaff: { id: string; name: string; initials: string } | null; completedAt: string | null; createdAt: string; supportingStaffIds: string[]; payment: { amount: number; tip: number; method: 'CARD' | 'CASH'; confirmedAt: string } | null; turns: Array<{ status: string; reason: string | null }>; services: Array<{ id: string; serviceId: string; sequence: number; serviceName: string; durationMin: number; amount: number; status: string; primaryStaff: { id: string; name: string; initials: string } | null; turnExclusions: Array<{ staffId: string; staffName: string; reason: string; createdAt: string }> }> };
type PaymentHistoryEvent = { id: string; action: string; actorName: string; createdAt: string; metadata: { [key: string]: unknown } | null };
type PaymentHistoryPayload = { payment: { id: string; appointmentId: string; code: string; customerName: string; originalAmount: number; amount: number; tip: number; total: number; method: 'CARD' | 'CASH'; cashReceived: number | null; changeGiven: number; confirmedAt: string | null; confirmedBy: string; refundedAmount: number; refundableAmount: number; status: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' }; events: PaymentHistoryEvent[] };
type AppointmentPageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type AppointmentSummary = { totalRevenue: number; totalDuration: number };
type AppointmentFilterOptions = { staff: Array<{ id: string; name: string }>; services: Array<{ id: string; name: string }> };
type ReportPeriod = 'day' | 'month';
type ReportTrendPoint = { date: string; revenue: number; appointmentCount: number; completedCount: number };
type Report = { period: ReportPeriod; businessDate?: string; businessMonth?: string; periodStart: string; periodEnd: string; periodLabel: string; appointmentCount: number; openCount: number; pendingPaymentCount: number; cancelledCount: number; revenue: number; completedCount: number; cardTotal: number; cashTotal: number; tipTotal: number; cardCollectedTotal: number; cashCollectedTotal: number; totalCollected: number; byService: Array<{ serviceName: string; revenue: number; count: number }>; byCategory: Array<{ categoryName: string; revenue: number; count: number }>; byStaff: Array<{ staffName: string; revenue: number; count: number }>; dailyTrend: ReportTrendPoint[]; reconciliation: { recordedTotal: number; difference: number; isBalanced: boolean } };

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [{ id: 'overview', label: 'Dashboard', icon: LayoutDashboard }, { id: 'attendance', label: 'Attendance', icon: CalendarClock }, { id: 'queue', label: 'Queue', icon: ListOrdered }, { id: 'appointments', label: 'Appointments', icon: ClipboardList }, { id: 'payments', label: 'Payments', icon: WalletCards }, { id: 'customers', label: 'Customers', icon: UsersRound }, { id: 'config', label: 'Settings', icon: Settings2 }];
const shopConfigTabs: Array<{ id: ShopConfigSection; label: string; icon: typeof Settings2 }> = [{ id: 'general', label: 'General', icon: Settings2 }, { id: 'staff', label: 'Staff', icon: BadgeCheck }, { id: 'services', label: 'Services', icon: Hand }, { id: 'skills', label: 'Skills', icon: Tags }, { id: 'skipReasons', label: 'Skip reasons', icon: ListChecks }, { id: 'accounts', label: 'Accounts', icon: UserCog }];

const emptyReport: Report = { period: 'day', businessDate: '', periodStart: '', periodEnd: '', periodLabel: '', appointmentCount: 0, openCount: 0, pendingPaymentCount: 0, cancelledCount: 0, revenue: 0, completedCount: 0, cardTotal: 0, cashTotal: 0, tipTotal: 0, cardCollectedTotal: 0, cashCollectedTotal: 0, totalCollected: 0, byService: [], byCategory: [], byStaff: [], dailyTrend: [], reconciliation: { recordedTotal: 0, difference: 0, isBalanced: true } };

export default function AdminPage() {
  const [section, setSection] = useState<Section>('overview');
  const [shopConfigSection, setShopConfigSection] = useState<ShopConfigSection>('general');
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
  const [paymentAmount, setPaymentAmount] = useState('');
  const [tip, setTip] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentAdjustmentReason, setPaymentAdjustmentReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [queueRepairing, setQueueRepairing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [shop, setShop] = useState({ timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', currency: 'USD' });

  async function refresh(period = reportPeriod, date = reportDate, month = reportMonth, background = false) {
    if (!background) setLoading(true);
    setLoadError('');
    try {
      const reportQuery = period === 'month'
        ? `?period=month${month ? `&month=${encodeURIComponent(month)}` : ''}`
        : (date ? `?date=${encodeURIComponent(date)}` : '');
      const appointmentsQuery = period === 'month'
        ? `?month=${month ? encodeURIComponent(month) : ''}&page=1&pageSize=3`
        : (date ? `?date=${encodeURIComponent(date)}&page=1&pageSize=3` : '?page=1&pageSize=3');
      const [liveAppointmentsResponse, reportAppointmentsResponse, reportResponse, configResponse] = await Promise.all([
        fetch('/api/admin/appointments', { cache: 'no-store' }),
        fetch(`/api/admin/appointments${appointmentsQuery}`, { cache: 'no-store' }),
        fetch(`/api/admin/reports${reportQuery}`, { cache: 'no-store' }),
        fetch('/api/admin/config', { cache: 'no-store' }),
      ]);
      if (!liveAppointmentsResponse.ok || !reportAppointmentsResponse.ok || !reportResponse.ok || !configResponse.ok) throw new Error('Unable to load dashboard data');
      const [liveAppointmentsPayload, reportAppointmentsPayload, reportPayload, configPayload] = await Promise.all([liveAppointmentsResponse.json(), reportAppointmentsResponse.json(), reportResponse.json(), configResponse.json()]);
      setAppointments(liveAppointmentsPayload.appointments ?? []);
      setReportAppointments(reportAppointmentsPayload.appointments ?? []);
      setReport(reportPayload);
      if (configPayload.shop) setShop(configPayload.shop);
      setLastUpdatedAt(new Date());
      setDataRevision((revision) => revision + 1);
      setReportPeriod(reportPayload.period ?? period);
      if (reportPayload.period === 'month') setReportMonth(reportPayload.businessMonth ?? month);
      else setReportDate(reportPayload.businessDate ?? date);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data');
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
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, [section]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const maxServiceRevenue = Math.max(...report.byService.map((entry) => entry.revenue), 1);
  const maxCategoryRevenue = Math.max(...report.byCategory.map((entry) => entry.revenue), 1);
  const completionRate = report.appointmentCount ? Math.round((report.completedCount / report.appointmentCount) * 100) : 0;
  const paymentTotal = report.totalCollected;
  const cardPaymentShare = paymentTotal ? Math.round((report.cardCollectedTotal / paymentTotal) * 100) : 0;
  const cashPaymentShare = paymentTotal ? 100 - cardPaymentShare : 0;

  function formatMoney(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: shop.currency }).format(value); }
  function openPayment(appointment: Appointment) { setPaymentModal(appointment); setMethod('CARD'); setPaymentAmount(String(appointment.amount)); setTip(''); setCashReceived(''); setPaymentAdjustmentReason(''); }
  function openAppointmentAction(appointment: Appointment, mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION') { setAppointmentAction({ appointment, mode }); }
  function resetAdminScroll() { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
  function navigateToSection(nextSection: Section) { resetAdminScroll(); setSection(nextSection); if (nextSection === 'appointments') setAppointmentFilter('ALL'); }
  function openAppointments(filter: AppointmentFilter = 'ALL') { resetAdminScroll(); setAppointmentFilter(filter); setSection('appointments'); }
  const closePayment = useCallback(() => { setPaymentModal(null); setPaymentAmount(''); setTip(''); setCashReceived(''); setPaymentAdjustmentReason(''); }, []);
  const paymentDialogRef = useDialogFocus(Boolean(paymentModal), closePayment);
  async function confirmPayment() {
    if (!paymentModal) return;
    const parsedAmount = Number(paymentAmount);
    const parsedTip = tip.trim() ? Number(tip) : 0;
    const parsedCashReceived = cashReceived.trim() ? Number(cashReceived) : undefined;
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) { setToast('Enter a valid final amount.'); return; }
    if (!Number.isFinite(parsedTip) || parsedTip < 0) { setToast('Enter a valid non-negative tip.'); return; }
    if (method === 'CASH' && parsedCashReceived !== undefined && (!Number.isFinite(parsedCashReceived) || parsedCashReceived < 0)) { setToast('Enter a valid cash received amount.'); return; }
    if (Math.abs(parsedAmount - paymentModal.amount) > 0.005 && paymentAdjustmentReason.trim().length < 2) { setToast('Enter a reason when changing the final amount.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/payments/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appointmentId: paymentModal.id, method, amount: parsedAmount, tip: parsedTip, cashReceived: method === 'CASH' ? parsedCashReceived : undefined, adjustmentReason: paymentAdjustmentReason.trim() || undefined, idempotencyKey: `payment-${paymentModal.id}-${method}-${parsedAmount}-${parsedTip}-${parsedCashReceived ?? 'card'}` }) });
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
      setToast(`Assignment check complete · ${routedAppointments} appointment${routedAppointments === 1 ? '' : 's'} reviewed.`);
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
    if (loading) return <div className="card management-loading" role="status">Loading dashboard…</div>;
    if (loadError) return <div className="management-error" role="alert">{loadError}<button className="button button-quiet button-sm" onClick={() => void refresh()}>Retry</button></div>;
    const reportLabel = formatReportPeriodLabel(report);
    const periodName = report.period === 'month' ? 'month' : 'business date';
    return <>
      <div className="dashboard-greeting">
        <div>
          <div className="eyebrow">{report.period === 'month' ? 'Business month' : 'Business date'} · {reportLabel}</div>
          <h2>Business overview</h2>
          <p>Revenue, completed appointments, and live queue activity for the selected {periodName}.</p>
        </div>
        <div className="report-toolbar">
          <ReportPeriodFilter period={reportPeriod} date={reportDate} month={reportMonth} onPeriodChange={changeReportPeriod} onDateChange={changeReportDate} onMonthChange={changeReportMonth} loading={loading} />
        </div>
      </div>
      <div className="kpi-grid">
        <Kpi icon={CircleDollarSign} label="Service revenue" value={formatMoney(report.revenue)} meta={`Excludes tips · ${reportLabel}`} tone="blue" />
        <Kpi icon={Banknote} label="Tips collected" value={formatMoney(report.tipTotal)} meta="Separate from service revenue" tone="teal" />
        <Kpi icon={CheckCircle2} label="Completed appointments" value={String(report.completedCount)} meta={`${completionRate}% of selected appointments`} tone="teal" onClick={() => openAppointments('COMPLETED')} actionLabel="Open completed appointments" actionHint="View completed" />
        <Kpi icon={Clock3} label="Open appointments" value={String(report.openCount)} meta={`${report.pendingPaymentCount} payment pending`} tone="orange" onClick={() => navigateToSection('queue')} actionLabel="Open Queue to review active appointments" actionHint="Open queue" />
      </div>
      <section className="card card-pad dashboard-collection-card" aria-labelledby="collection-summary-title">
        <div className="card-title-row"><div><h3 id="collection-summary-title" className="card-title">Collection summary</h3><p>Card and cash amounts include tips.</p></div><StatusBadge label={report.totalCollected ? `${formatMoney(report.totalCollected)} collected` : 'No collections'} tone={report.totalCollected ? 'success' : 'neutral'} /></div>
        <div className="collection-total-row"><div className="collection-total-copy"><span>Total collected</span><strong>{formatMoney(report.totalCollected)}</strong></div><p>Service revenue {formatMoney(report.revenue)} · tips {formatMoney(report.tipTotal)}</p></div>
        <div className="payment-split-summary" role="group" aria-label={`Payment methods: ${cardPaymentShare}% card, ${cashPaymentShare}% cash`}><strong>{cardPaymentShare}% card</strong><span>{cashPaymentShare}% cash</span></div>
        <div className="payment-split-track" aria-hidden="true"><span className="payment-split-track-card" style={{ width: `${cardPaymentShare}%` }} /><span className="payment-split-track-cash" style={{ width: `${cashPaymentShare}%` }} /></div>
        <div className="payment-split-legend"><div className="payment-split-legend-item"><span>Card collected</span><strong>{formatMoney(report.cardCollectedTotal)}</strong></div><div className="payment-split-legend-item"><span>Cash collected</span><strong>{formatMoney(report.cashCollectedTotal)}</strong></div></div>
      </section>
      {report.period === 'month' ? <MonthlyTrendCard trend={report.dailyTrend} currency={shop.currency} /> : null}
      <div className="dashboard-grid">
        <section className="card card-pad">
          <div className="card-title-row"><div><h3 className="card-title">Revenue by service</h3><p>Service revenue for {reportLabel}; tips are excluded.</p></div><StatusBadge label={report.reconciliation.isBalanced ? 'Balanced' : 'Review'} tone={report.reconciliation.isBalanced ? 'success' : 'warning'} /></div>
          <div className="report-bars">{report.byService.length ? report.byService.map((entry) => <div className="report-bar-row" key={entry.serviceName}><span>{entry.serviceName.replace(' Manicure', '')}</span><div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${(entry.revenue / maxServiceRevenue) * 100}%` }} /></div><strong>{formatMoney(entry.revenue)}</strong></div>) : <div className="empty-state"><span>No confirmed payments for this {periodName}.</span></div>}</div>
          <div className="divider" />
          <div className="reconciliation"><div className="reconciliation-row"><span>Service revenue</span><strong>{formatMoney(report.revenue)}</strong></div><div className="reconciliation-row"><span>Service card</span><strong>{formatMoney(report.cardTotal)}</strong></div><div className="reconciliation-row"><span>Service cash</span><strong>{formatMoney(report.cashTotal)}</strong></div><div className="reconciliation-status"><CheckCircle2 size={17} aria-hidden="true" />{report.reconciliation.isBalanced ? `Service revenue balanced · difference ${formatMoney(0)}` : `Review difference ${formatMoney(report.reconciliation.difference)}`}</div></div>
        </section>
        <section className="card card-pad">
          <div className="card-title-row"><div><h3 id="revenue-by-category-title" className="card-title">Revenue by category</h3><p>Service revenue grouped by category for {reportLabel}.</p></div><StatusBadge label={report.reconciliation.isBalanced ? 'Balanced' : 'Review'} tone={report.reconciliation.isBalanced ? 'success' : 'warning'} /></div>
          <div className="report-bars report-category-bars" role="list" aria-labelledby="revenue-by-category-title">{report.byCategory.length ? report.byCategory.map((entry) => <div className="report-bar-row" key={entry.categoryName} role="listitem"><span>{entry.categoryName}</span><div className="report-bar-track" aria-hidden="true"><div className="report-bar-fill" style={{ width: `${(entry.revenue / maxCategoryRevenue) * 100}%` }} /></div><strong>{formatMoney(entry.revenue)}</strong></div>) : <div className="empty-state"><span>No confirmed payments for this {periodName}.</span></div>}</div>
        </section>
      </div>
      <section className="card card-pad dashboard-staff-card">
        <div className="card-title-row"><div><h3 className="card-title">Revenue by staff</h3><p>Service revenue only; tips are excluded. Attribution is for operations, not ranking.</p></div><StatusBadge label={report.reconciliation.isBalanced ? 'Balanced' : 'Review'} tone={report.reconciliation.isBalanced ? 'success' : 'warning'} /></div>
        {report.byStaff.length ? <div className="admin-table-wrap report-staff-table-wrap" style={{ marginTop: 20 }}><table className="admin-table report-staff-table"><thead><tr><th>Staff</th><th>Completed appointments</th><th>Revenue</th></tr></thead><tbody>{report.byStaff.map((entry) => <tr key={entry.staffName}><td>{entry.staffName}</td><td>{entry.count}</td><td><strong>{formatMoney(entry.revenue)}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><span>No confirmed payments for this {periodName}.</span></div>}
      </section>
    </>;
  }

  function renderShopConfig() {
    return <>
      <nav className="shop-config-tabs" aria-label="Salon settings sections">
        {shopConfigTabs.map((tab) => {
          const Icon = tab.icon;
          const active = shopConfigSection === tab.id;
          return <button type="button" key={tab.id} className={`shop-config-tab ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => setShopConfigSection(tab.id)}><Icon size={19} strokeWidth={1.9} aria-hidden="true" /><span>{tab.label}</span></button>;
        })}
      </nav>
      <div className="shop-config-tab-content">
        {shopConfigSection === 'general' ? <AdminShopConfig onToast={setToast} /> : null}
        {shopConfigSection === 'staff' ? <AdminManagement kind="staff" currency={shop.currency} onToast={setToast} /> : null}
        {shopConfigSection === 'services' ? <AdminManagement kind="services" currency={shop.currency} onToast={setToast} /> : null}
        {shopConfigSection === 'skills' ? <AdminAccessManagement kind="skills" onToast={setToast} /> : null}
        {shopConfigSection === 'skipReasons' ? <AdminSkipReasons onToast={setToast} /> : null}
        {shopConfigSection === 'accounts' ? <AdminAccessManagement kind="accounts" onToast={setToast} /> : null}
      </div>
    </>;
  }

  function renderSection() { if (section === 'overview') return renderOverview(); if (section === 'queue') return <QueueView appointments={appointments} onPayment={openPayment} onRepair={() => void repairQueue()} repairing={queueRepairing} />; if (section === 'appointments') return <AppointmentsView appointments={reportAppointments} currency={shop.currency} timezone={shop.timezone} filter={appointmentFilter} reportPeriod={reportPeriod} reportDate={reportDate} reportMonth={reportMonth} refreshToken={dataRevision} onFilterChange={setAppointmentFilter} onPayment={openPayment} onAction={openAppointmentAction} />; if (section === 'payments') return <PaymentsView appointments={appointments} currency={shop.currency} businessDate={reportDate} businessMonth={reportMonth} refreshToken={dataRevision} onPayment={openPayment} onChanged={() => refresh()} />; if (section === 'config') return renderShopConfig(); if (section === 'attendance' || section === 'customers') return <AdminManagement kind={section} currency={shop.currency} onToast={setToast} />; return null; }

  return <main className={`admin-layout page-root ${section === 'config' ? 'admin-settings-context' : ''}`}><aside className="admin-sidebar"><Link className="brand" href="/"><span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span><span className="brand-copy">Wellness Salon <small>Operations</small></span></Link><nav className="admin-nav" aria-label="Operations sections"><div className="admin-nav-label">Operations</div>{navItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={`admin-nav-link ${section === item.id ? 'active' : ''}`} aria-current={section === item.id ? 'page' : undefined} onClick={() => navigateToSection(item.id)}><Icon size={21} strokeWidth={1.8} aria-hidden="true" />{item.label}</button>; })}</nav><div className="admin-sidebar-footer"><div className="subtle">Signed in as</div><div className="table-customer"><InitialsAvatar initials="A" tone="blue" /><div><strong style={{ fontSize: '0.83rem' }}>Administrator</strong><small>Active account</small></div></div><SignOutButton callbackUrl="/admin/sign-in" className="button button-quiet button-sm" /></div></aside><section className="admin-main"><header className="admin-topbar"><div className="admin-topbar-title"><Menu size={20} className="muted" aria-hidden="true" /><h1>{navItems.find((item) => item.id === section)?.label}</h1><span>· Live</span></div><div className="topbar-actions"><span className="admin-live-status" role="status" aria-live="polite"><span className="admin-live-dot" aria-hidden="true" />{lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Connecting…'}</span><button type="button" className="button button-outline button-sm admin-refresh-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh dashboard data"><RefreshCcw size={17} aria-hidden="true" className={loading ? 'spin' : undefined} /><span>Refresh</span></button><Link className="button button-board-nav" href="/board"><span className="nav-action-icon"><ClipboardList size={18} aria-hidden="true" /></span><span>Open queue board</span></Link></div></header><div className="admin-content">{renderSection()}</div></section>{paymentModal ? <div className="modal-backdrop"><div className="modal" ref={paymentDialogRef} role="dialog" aria-modal="true" aria-labelledby="payment-title"><div className="modal-header"><div><h2 id="payment-title">Confirm payment</h2><p>{paymentModal.code} · {paymentModal.customerName} · Service fee {formatMoney(paymentModal.amount)}</p></div><button type="button" className="modal-close" aria-label="Close payment dialog" onClick={closePayment}><X size={19} aria-hidden="true" /></button></div><div className="field payment-method-field"><span id="payment-method-label" className="payment-method-label">Payment method</span><div className="payment-method-options" role="group" aria-labelledby="payment-method-label"><button type="button" className={`payment-method-option ${method === 'CASH' ? 'active' : ''}`} aria-pressed={method === 'CASH'} disabled={busy} onClick={() => setMethod('CASH')}><Banknote size={20} aria-hidden="true" />Cash</button><button type="button" className={`payment-method-option ${method === 'CARD' ? 'active' : ''}`} aria-pressed={method === 'CARD'} disabled={busy} onClick={() => setMethod('CARD')}><CreditCard size={20} aria-hidden="true" />Card</button></div></div><div className="field"><label htmlFor="payment-final-amount">Final amount ({shop.currency})</label><input id="payment-final-amount" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /><span className="field-hint">Service fee is {formatMoney(paymentModal.amount)}. Add a reason if the final amount is different.</span></div><div className="field"><label htmlFor="payment-tip">Tip ({shop.currency})</label><input id="payment-tip" type="number" min="0" max="100000" step="0.01" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0.00" /><span className="field-hint">Optional. Recorded separately from the service amount.</span></div>{method === 'CASH' ? <div className="field"><label htmlFor="payment-cash-received">Cash received ({shop.currency})</label><input id="payment-cash-received" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="Amount handed over" /><span className="field-hint">Change is calculated automatically from the final amount plus tip.</span></div> : null}{Math.abs(Number(paymentAmount || 0) - paymentModal.amount) > 0.005 ? <div className="field"><label htmlFor="payment-adjustment-reason">Reason for amount change</label><textarea id="payment-adjustment-reason" rows={2} maxLength={200} value={paymentAdjustmentReason} onChange={(event) => setPaymentAdjustmentReason(event.target.value)} placeholder="Discount or price correction…" required /></div> : null}<PaymentPreview amount={paymentAmount} tip={tip} method={method} cashReceived={cashReceived} currency={shop.currency} /><p className="field-hint" style={{ marginTop: 12 }}>Payment is recorded here after the collection is complete. Card details are never stored in the app.</p><div className="form-actions"><button type="button" className="button button-quiet" onClick={closePayment}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={confirmPayment}>{busy ? 'Confirming…' : 'Confirm & complete'}</button></div></div></div> : null}{appointmentAction ? <AdminAppointmentAction appointment={appointmentAction.appointment} mode={appointmentAction.mode} currency={shop.currency} onClose={() => setAppointmentAction(null)} onComplete={(message) => { setAppointmentAction(null); setToast(message); void refresh(); }} /> : null}{toast ? <div className="toast" role="status"><CheckCircle2 size={17} aria-hidden="true" />{toast}</div> : null}</main>;
}

function Kpi({ icon: Icon, label, value, meta, tone, onClick, actionLabel, actionHint }: { icon: typeof CircleDollarSign; label: string; value: string; meta: string; tone: 'blue' | 'teal' | 'orange' | 'slate'; onClick?: () => void; actionLabel?: string; actionHint?: string }) {
  const content = <><div className="kpi-label"><span>{label}</span><span className={`kpi-icon ${tone === 'teal' ? 'avatar-teal' : tone === 'orange' ? 'avatar-orange' : tone === 'slate' ? 'avatar-slate' : ''}`}><Icon size={17} aria-hidden="true" /></span></div><strong className="kpi-value">{value}</strong><span className="kpi-meta">{meta}</span>{actionHint ? <span className="kpi-action-hint">{actionHint}<ChevronRight size={14} aria-hidden="true" /></span> : null}</>;
  return onClick ? <button type="button" className="card kpi-card kpi-card-action" onClick={onClick} aria-label={actionLabel}>{content}</button> : <div className="card kpi-card">{content}</div>;
}
function PaymentPreview({ amount, tip, method, cashReceived, currency }: { amount: string; tip: string; method: 'CARD' | 'CASH'; cashReceived: string; currency: string }) {
  const parsedAmount = Number(amount);
  const safeAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;
  const parsedTip = tip.trim() ? Number(tip) : 0;
  const safeTip = Number.isFinite(parsedTip) && parsedTip >= 0 ? parsedTip : 0;
  const total = safeAmount + safeTip;
  const parsedCashReceived = cashReceived.trim() ? Number(cashReceived) : total;
  const safeCashReceived = Number.isFinite(parsedCashReceived) && parsedCashReceived >= 0 ? parsedCashReceived : 0;
  const change = method === 'CASH' && safeCashReceived >= total ? safeCashReceived - total : 0;
  return <div className="payment-preview" aria-live="polite"><div><span>Final amount</span><strong>{formatAdminMoney(safeAmount, currency)}</strong></div><div><span>Tip</span><strong>{formatAdminMoney(safeTip, currency)}</strong></div><div className="payment-preview-total"><span>Total due</span><strong>{formatAdminMoney(total, currency)}</strong></div>{method === 'CASH' ? <><div><span>Cash received</span><strong>{formatAdminMoney(safeCashReceived, currency)}</strong></div><div className="payment-preview-total"><span>Change</span><strong>{formatAdminMoney(change, currency)}</strong></div></> : null}</div>;
}
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
function AppointmentPeriodFilter({ mode, date, month, from, to, onModeChange, onDateChange, onMonthChange, onFromChange, onToChange, loading, error }: { mode: AppointmentDateMode; date: string; month: string; from: string; to: string; onModeChange: (mode: AppointmentDateMode) => void; onDateChange: (value: string) => void; onMonthChange: (value: string) => void; onFromChange: (value: string) => void; onToChange: (value: string) => void; loading: boolean; error: string }) {
  const isDay = mode === 'DAY';
  return <div className="report-period-filter appointment-period-filter">
    <div className="period-toggle" role="group" aria-label="Appointment date scope">
      <button type="button" className={`button button-sm ${isDay ? 'active' : ''}`} onClick={() => onModeChange('DAY')} aria-pressed={isDay} disabled={loading}>Day</button>
      <button type="button" className={`button button-sm ${mode === 'MONTH' ? 'active' : ''}`} onClick={() => onModeChange('MONTH')} aria-pressed={mode === 'MONTH'} disabled={loading}>Month</button>
      <button type="button" className={`button button-sm ${mode === 'RANGE' ? 'active' : ''}`} onClick={() => onModeChange('RANGE')} aria-pressed={mode === 'RANGE'} disabled={loading}>Range</button>
    </div>
    {mode === 'RANGE' ? <div className="appointment-range-filter">
      <div className="date-filter">
        <label htmlFor="appointment-from">From</label>
        <div className="date-filter-controls"><input id="appointment-from" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} required disabled={loading} /></div>
      </div>
      <div className="date-filter">
        <label htmlFor="appointment-to">To</label>
        <div className="date-filter-controls"><input id="appointment-to" type="date" value={to} onChange={(event) => onToChange(event.target.value)} required disabled={loading} /></div>
      </div>
    </div> : <div className="date-filter">
      <label htmlFor={isDay ? 'appointment-date' : 'appointment-month'}>{isDay ? 'Business date' : 'Business month'}</label>
      <div className="date-filter-controls"><input id={isDay ? 'appointment-date' : 'appointment-month'} type={isDay ? 'date' : 'month'} value={isDay ? date : month} onChange={(event) => isDay ? onDateChange(event.target.value) : onMonthChange(event.target.value)} required disabled={loading} /></div>
    </div>}
    {loading ? <span className="subtle appointment-date-loading" role="status" aria-live="polite">Loading…</span> : null}
    {error ? <small className="form-error appointment-period-error" role="alert">{error}</small> : null}
  </div>;
}
function PaymentHistoryPeriodFilter({ mode, date, month, from, to, onModeChange, onDateChange, onMonthChange, onFromChange, onToChange, loading, error }: { mode: AppointmentDateMode; date: string; month: string; from: string; to: string; onModeChange: (mode: AppointmentDateMode) => void; onDateChange: (value: string) => void; onMonthChange: (value: string) => void; onFromChange: (value: string) => void; onToChange: (value: string) => void; loading: boolean; error: string }) {
  const isDay = mode === 'DAY';
  return <div className="report-period-filter appointment-period-filter payment-history-period-filter">
    <div className="period-toggle" role="group" aria-label="Payment history date scope">
      <button type="button" className={`button button-sm ${isDay ? 'active' : ''}`} onClick={() => onModeChange('DAY')} aria-pressed={isDay} disabled={loading}>Day</button>
      <button type="button" className={`button button-sm ${mode === 'MONTH' ? 'active' : ''}`} onClick={() => onModeChange('MONTH')} aria-pressed={mode === 'MONTH'} disabled={loading}>Month</button>
      <button type="button" className={`button button-sm ${mode === 'RANGE' ? 'active' : ''}`} onClick={() => onModeChange('RANGE')} aria-pressed={mode === 'RANGE'} disabled={loading}>Range</button>
    </div>
    {mode === 'RANGE' ? <div className="appointment-range-filter">
      <div className="date-filter"><label htmlFor="payment-history-from">From</label><div className="date-filter-controls"><input id="payment-history-from" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} required disabled={loading} /></div></div>
      <div className="date-filter"><label htmlFor="payment-history-to">To</label><div className="date-filter-controls"><input id="payment-history-to" type="date" value={to} onChange={(event) => onToChange(event.target.value)} required disabled={loading} /></div></div>
    </div> : <div className="date-filter"><label htmlFor={isDay ? 'payment-history-date' : 'payment-history-month'}>{isDay ? 'Payment date' : 'Payment month'}</label><div className="date-filter-controls"><input id={isDay ? 'payment-history-date' : 'payment-history-month'} type={isDay ? 'date' : 'month'} value={isDay ? date : month} onChange={(event) => isDay ? onDateChange(event.target.value) : onMonthChange(event.target.value)} required disabled={loading} /></div></div>}
    {error ? <small className="form-error appointment-period-error" role="alert">{error}</small> : null}
  </div>;
}
function MonthlyTrendCard({ trend, currency }: { trend: ReportTrendPoint[]; currency: string }) {
  const maxRevenue = Math.max(...trend.map((point) => point.revenue), 1);
  return <section className="card card-pad monthly-trend-card">
    <div className="card-title-row"><div><h3 className="card-title">Monthly trend</h3><p>Service revenue and completed activity by business day.</p></div><StatusBadge label={`${trend.length} active day${trend.length === 1 ? '' : 's'}`} tone="neutral" /></div>
    {trend.length ? <div className="monthly-trend" role="img" aria-label="Monthly revenue trend">{trend.map((point) => <div className="monthly-trend-column" key={point.date} title={`${formatBusinessDateLabel(point.date)} · ${formatAdminMoney(point.revenue, currency)} · ${point.appointmentCount} appointments`}><strong>{formatAdminMoney(Math.round(point.revenue), currency)}</strong><div className="monthly-trend-bar-track"><div className="monthly-trend-bar" style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, 4)}%` }} /></div><small>{new Date(`${point.date}T00:00:00Z`).getUTCDate()}</small></div>)}</div> : <div className="empty-state"><span>No appointment activity for this business month.</span></div>}
  </section>;
}
function QueueView({ appointments, onPayment, onRepair, repairing }: { appointments: Appointment[]; onPayment: (appointment: Appointment) => void; onRepair: () => void; repairing: boolean }) {
  return <><SectionHeader eyebrow="Today" title="Queue" description="Active appointments from check-in through payment." action={<button type="button" className="button button-outline button-sm" onClick={onRepair} disabled={repairing}><RefreshCcw size={15} aria-hidden="true" className={repairing ? 'spin' : undefined} />{repairing ? 'Checking…' : 'Re-check assignments'}</button>} /><div className="card card-pad"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Turn</th><th>Customer</th><th>Services</th><th>Assigned</th><th>Status</th><th /></tr></thead><tbody>{appointments.filter((appointment) => !['COMPLETED', 'CANCELLED'].includes(appointment.status)).map((appointment) => {
    const services = appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, sequence: 1, serviceName: appointment.serviceName, durationMin: appointment.durationMin, amount: appointment.amount, status: appointment.status, primaryStaff: appointment.primaryStaff }];
    const totalDuration = services.reduce((total, service) => total + service.durationMin, 0);
    return <tr key={appointment.id}><td><strong>{appointment.code}</strong></td><td><div className="table-customer"><InitialsAvatar initials={appointment.customerName.split(' ').map((part) => part[0]).join('').slice(0, 2)} tone="slate" /><div><strong>{appointment.customerName}</strong><small>{appointment.phone}</small></div></div></td><td><div className="queue-table-service-list">{services.map((service) => <div className="queue-table-service-row" key={service.id}><strong>{service.sequence}. {service.serviceName}</strong><small>{service.durationMin} min</small></div>)}</div><span className="table-note">{services.length} service{services.length === 1 ? '' : 's'} · {totalDuration} min total</span></td><td>{appointment.primaryStaff ? <div className="assigned-staff"><InitialsAvatar initials={appointment.primaryStaff.initials} tone="blue" /><div className="assigned-staff-copy"><strong>{appointment.primaryStaff.name}</strong><small>Assigned specialist</small></div></div> : <span className="subtle">Unassigned</span>}</td><td><StatusBadge label={appointment.status.replace('_', ' ')} tone={appointment.status === 'IN_SERVICE' ? 'blue' : appointment.status === 'PAYMENT_PENDING' ? 'warning' : 'neutral'} /></td><td>{appointment.status === 'PAYMENT_PENDING' ? <button className="button button-primary button-sm" onClick={() => onPayment(appointment)}>Payment</button> : null}</td></tr>;
  })}</tbody></table></div></div></>;
}
function AppointmentsView({ appointments, currency, timezone, filter, reportPeriod, reportDate, reportMonth, refreshToken, onFilterChange, onPayment, onAction }: { appointments: Appointment[]; currency: string; timezone: string; filter: AppointmentFilter; reportPeriod: ReportPeriod; reportDate: string; reportMonth: string; refreshToken: number; onFilterChange: (filter: AppointmentFilter) => void; onPayment: (appointment: Appointment) => void; onAction: (appointment: Appointment, mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION') => void }) {
  const [rows, setRows] = useState(appointments);
  const [status, setStatus] = useState<AppointmentStatusFilter>(filter === 'COMPLETED' ? 'COMPLETED' : 'ALL');
  const [payment, setPayment] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL');
  const [staffId, setStaffId] = useState('ALL');
  const [serviceId, setServiceId] = useState('ALL');
  const [serviceStatus, setServiceStatus] = useState('ALL');
  const [serviceCount, setServiceCount] = useState<'ALL' | 'SINGLE' | 'MULTI'>('ALL');
  const [sort, setSort] = useState<'NEWEST' | 'OLDEST' | 'AMOUNT_DESC' | 'DURATION_DESC'>('NEWEST');
  const [search, setSearch] = useState('');
  const [dateMode, setDateMode] = useState<AppointmentDateMode>(reportPeriod === 'month' ? 'MONTH' : 'DAY');
  const [dateValue, setDateValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [monthValue, setMonthValue] = useState(reportMonth || new Date().toISOString().slice(0, 7));
  const [fromValue, setFromValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [toValue, setToValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  const [pagination, setPagination] = useState<AppointmentPageMeta>({ page: 1, pageSize: 25, total: appointments.length, totalPages: 1 });
  const [summary, setSummary] = useState<AppointmentSummary>({ totalRevenue: 0, totalDuration: 0 });
  const [filterOptions, setFilterOptions] = useState<AppointmentFilterOptions>({ staff: [], services: [] });
  const [historyAppointment, setHistoryAppointment] = useState<Appointment | null>(null);
  const dateRequestRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const lastRefreshTokenRef = useRef(refreshToken);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const staffOptions = filterOptions.staff.length ? filterOptions.staff : [...new Map(rows.flatMap((appointment) => [appointment.primaryStaff, ...appointment.services.map((service) => service.primaryStaff)]).filter((staff): staff is NonNullable<typeof staff> => Boolean(staff)).map((staff) => [staff.id, { id: staff.id, name: staff.name }])).values()].sort((left, right) => left.name.localeCompare(right.name));
  const serviceOptions = filterOptions.services.length ? filterOptions.services : [...new Map(rows.flatMap((appointment) => appointment.services.length ? appointment.services.map((service) => ({ id: service.serviceId, name: service.serviceName })) : [{ id: appointment.serviceId, name: appointment.serviceName }]).map((service) => [service.id, service])).values()].sort((left, right) => left.name.localeCompare(right.name));
  const activeFilterCount = [search, status !== 'ALL' ? status : '', payment !== 'ALL' ? payment : '', staffId !== 'ALL' ? staffId : '', serviceId !== 'ALL' ? serviceId : '', serviceStatus !== 'ALL' ? serviceStatus : '', serviceCount !== 'ALL' ? serviceCount : '', sort !== 'NEWEST' ? sort : ''].filter(Boolean).length;

  function clearFilters() { setSearch(''); setStatus('ALL'); onFilterChange('ALL'); setPayment('ALL'); setStaffId('ALL'); setServiceId('ALL'); setServiceStatus('ALL'); setServiceCount('ALL'); setSort('NEWEST'); }
  function buildQuery(page: number) {
    const params = new URLSearchParams();
    if (dateMode === 'MONTH') params.set('month', monthValue);
    else if (dateMode === 'RANGE') { params.set('from', fromValue); params.set('to', toValue); }
    else params.set('date', dateValue);
    params.set('page', String(page));
    params.set('pageSize', '25');
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'ALL') params.set('status', status);
    if (payment !== 'ALL') params.set('payment', payment);
    if (staffId !== 'ALL') params.set('staffId', staffId);
    if (serviceId !== 'ALL') params.set('serviceId', serviceId);
    if (serviceStatus !== 'ALL') params.set('serviceStatus', serviceStatus);
    if (serviceCount !== 'ALL') params.set('serviceCount', serviceCount);
    if (sort !== 'NEWEST') params.set('sort', sort);
    return params.toString();
  }

  async function loadPage(requestedPage = 1) {
    if (dateMode === 'RANGE' && (!fromValue || !toValue || fromValue > toValue)) { setDateError('Choose a valid date range.'); return; }
    const requestId = dateRequestRef.current + 1;
    dateRequestRef.current = requestId;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setDateLoading(true); setDateError('');
    try {
      const response = await fetch(`/api/admin/appointments?${buildQuery(requestedPage)}`, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load appointments');
      if (requestId !== dateRequestRef.current) return;
      setRows(payload.appointments ?? []);
      setPagination(payload.pagination ?? { page: 1, pageSize: 25, total: payload.appointments?.length ?? 0, totalPages: 1 });
      setSummary(payload.summary ?? { totalRevenue: 0, totalDuration: 0 });
      setFilterOptions(payload.filterOptions ?? { staff: [], services: [] });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === dateRequestRef.current) setDateError(error instanceof Error ? error.message : 'Unable to load appointments');
    } finally { if (requestId === dateRequestRef.current) setDateLoading(false); }
  }
  useEffect(() => {
    const shouldLoad = dateMode === 'DAY'
      ? Boolean(dateValue)
      : dateMode === 'MONTH'
        ? Boolean(monthValue)
        : Boolean(fromValue && toValue && fromValue <= toValue);
    // This effect intentionally starts the external history request when scope or filters change.
    if (!shouldLoad) return;
    const timer = window.setTimeout(() => { void loadPage(1); }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
    // The date inputs and server-backed filters are the deliberate triggers for this local history query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, dateValue, monthValue, fromValue, toValue, search, status, payment, staffId, serviceId, serviceStatus, serviceCount, sort]);
  useEffect(() => {
    if (refreshToken === 0 || refreshToken === lastRefreshTokenRef.current) return;
    lastRefreshTokenRef.current = refreshToken;
    void loadPage(pagination.page);
    // Parent refreshes are a deliberate signal after mutations or polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);
  function updateStatus(value: string) { const next = value as AppointmentStatusFilter; setStatus(next); if (next === 'COMPLETED' || filter === 'COMPLETED') onFilterChange(next === 'COMPLETED' ? 'COMPLETED' : 'ALL'); }
  function changeDateMode(next: AppointmentDateMode) { setDateMode(next); setDateError(''); }

  return <>
    <SectionHeader eyebrow="History" title="Appointments" description="Review appointments and filter single- or multi-service visits." action={<AppointmentPeriodFilter mode={dateMode} date={dateValue} month={monthValue} from={fromValue} to={toValue} onModeChange={changeDateMode} onDateChange={(value) => { setDateValue(value); setDateError(''); }} onMonthChange={(value) => { setMonthValue(value); setDateError(''); }} onFromChange={(value) => { setFromValue(value); setDateError(''); }} onToChange={(value) => { setToValue(value); setDateError(''); }} loading={dateLoading} error={dateError} />} />
    <div className="card card-pad appointment-history-card">
      <div className="appointment-filter-panel">
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
        <div className="appointment-filter-footer"><div className="appointment-summary"><strong>{pagination.total}</strong> matching · <strong>{formatAdminMoney(summary.totalRevenue, currency)}</strong> revenue · <strong>{summary.totalDuration} min</strong> booked</div><div className="appointment-filter-actions"><span className="subtle"><SlidersHorizontal size={14} aria-hidden="true" />{activeFilterCount ? `${activeFilterCount} filters active` : 'No filters applied'}</span>{activeFilterCount ? <button type="button" className="button button-quiet button-sm" onClick={clearFilters}><X size={15} aria-hidden="true" />Clear</button> : null}</div></div>
      </div>
      {rows.length ? <div className="admin-table-wrap" aria-busy={dateLoading}><table className="admin-table appointment-table"><thead><tr><th>Appointment</th><th>Customer</th><th>Services</th><th>Assigned</th><th>Created</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody>
        {rows.map((appointment) => {
          const services = appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, serviceId: appointment.serviceId, sequence: 1, serviceName: appointment.serviceName, durationMin: appointment.durationMin, amount: appointment.amount, status: appointment.status, primaryStaff: appointment.primaryStaff, turnExclusions: [] }];
          const duration = services.reduce((total, service) => total + service.durationMin, 0);
          const hasEditableService = services.some((service) => !['COMPLETED', 'CANCELLED'].includes(service.status));
          const canChangeService = hasEditableService && !['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].includes(appointment.status);
          const canReassign = services.some((service) => ['WAITING', 'ASSIGNED'].includes(service.status));
          const hasExclusion = services.some((service) => service.turnExclusions.length > 0);
          const canCancel = !['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].includes(appointment.status);
          const hasPendingPayment = appointment.status === 'PAYMENT_PENDING' && !appointment.payment;
          return <tr key={appointment.id}>
            <td><strong>{appointment.code}</strong><span className="table-note">{appointment.turns.length} activity record{appointment.turns.length === 1 ? '' : 's'}</span></td>
            <td><div className="table-customer"><InitialsAvatar initials={appointment.customerName.split(' ').map((part) => part[0]).join('').slice(0, 2)} tone="slate" /><div><strong>{appointment.customerName}</strong><small>{appointment.phone}</small></div></div></td>
            <td><div className="history-service-list">{services.map((service) => <div key={service.id}><strong>{service.sequence}. {service.serviceName}</strong><small className="table-note">{service.durationMin} min · {service.status.replace('_', ' ')}{service.turnExclusions.length ? ` · ${service.turnExclusions.length} skip exclusion${service.turnExclusions.length === 1 ? '' : 's'}` : ''}</small></div>)}</div><span className="table-note">{services.length} service{services.length === 1 ? '' : 's'} · {duration} min total</span></td>
            <td>{appointment.primaryStaff ? <div className="assigned-staff"><InitialsAvatar initials={appointment.primaryStaff.initials} tone="blue" /><div className="assigned-staff-copy"><strong>{appointment.primaryStaff.name}</strong><small>Primary assignment</small></div></div> : <span className="subtle">Unassigned</span>}</td>
            <td className="subtle">{formatAppointmentDateTime(appointment.createdAt)}</td>
            <td><StatusBadge label={appointment.status.replace('_', ' ')} tone={appointment.status === 'COMPLETED' ? 'success' : appointment.status === 'CANCELLED' ? 'neutral' : appointment.status === 'IN_SERVICE' ? 'blue' : appointment.status === 'PAYMENT_PENDING' ? 'warning' : 'neutral'} /></td>
            <td><strong>{formatAdminMoney(appointment.amount, currency)}</strong><span className="table-note">{appointment.payment ? 'Paid' : 'Unpaid'}</span></td>
            <td><AppointmentActionMenu appointmentCode={appointment.code} hasPendingPayment={hasPendingPayment} canCancel={canCancel} canChangeService={canChangeService} canReassign={canReassign} hasExclusion={hasExclusion} onHistory={() => setHistoryAppointment(appointment)} onPayment={() => onPayment(appointment)} onAction={(mode) => onAction(appointment, mode)} /></td>
          </tr>;
        })}
      </tbody></table></div> : <div className="empty-state"><CheckCircle2 size={28} aria-hidden="true" /><div><strong>No appointments match</strong><br /><span>Try another date or clear one of the filters.</span></div></div>}
      {pagination.total > pagination.pageSize ? <nav className="appointment-pagination" aria-label="Appointment history pagination"><span className="subtle">Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}</span><div className="appointment-pagination-actions"><button type="button" className="button button-quiet button-sm" onClick={() => void loadPage(pagination.page - 1)} disabled={dateLoading || pagination.page <= 1} aria-label="Previous appointment page"><ChevronLeft size={16} aria-hidden="true" />Previous</button><span className="subtle" aria-live="polite">Page {pagination.page} of {pagination.totalPages}</span><button type="button" className="button button-quiet button-sm" onClick={() => void loadPage(pagination.page + 1)} disabled={dateLoading || pagination.page >= pagination.totalPages} aria-label="Next appointment page">Next<ChevronRight size={16} aria-hidden="true" /></button></div></nav> : null}
    </div>
    {historyAppointment ? <TurnHistoryModal appointment={historyAppointment} timezone={timezone} onClose={() => setHistoryAppointment(null)} /> : null}
  </>;
}
type TurnHistoryEvent = { id: string; appointmentServiceId: string | null; turnId: string | null; serviceSequence: number | null; serviceName: string; serviceStatus: string | null; eventType: string; assignedStaffId: string | null; assignedStaffName: string | null; actorType: string; actorId: string | null; actorName: string; reason: string | null; createdAt: string };
type TurnHistoryPayload = { appointment: { id: string; code: string; customerName: string; phone: string; status: string }; turnRecordCount: number; eventCount: number; events: TurnHistoryEvent[] };
const turnEventLabels: Record<string, string> = { WAITING: 'Waiting for staff', ASSIGNED: 'Assigned', ACCEPTED: 'Accepted', SKIPPED: 'Skipped', FINISHED: 'Finished', REASSIGNED: 'Reassigned', CONTINUED_WITH_ME: 'Continued with me', SUPPORT_ADDED: 'Support added', SUPPORT_RELEASED: 'Support released', CANCELLED: 'Cancelled' };
function turnEventLabel(eventType: string) { return turnEventLabels[eventType] ?? eventType.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function formatTurnEventDateTime(value: string, timezone: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value)); }
function TurnHistoryModal({ appointment, timezone, onClose }: { appointment: Appointment; timezone: string; onClose: () => void }) {
  const [payload, setPayload] = useState<TurnHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [requestVersion, setRequestVersion] = useState(0);
  const dialogRef = useDialogFocus(true, onClose);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/appointments/${encodeURIComponent(appointment.id)}/turn-history`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const nextPayload = await response.json();
        if (!response.ok) throw new Error(nextPayload.error ?? 'Unable to load appointment history');
        return nextPayload as TurnHistoryPayload;
      })
      .then(setPayload)
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load appointment history');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appointment.id, requestVersion]);

  const serviceFilters = payload ? [...new Map(payload.events.map((event) => [event.appointmentServiceId ?? 'APPOINTMENT', { value: event.appointmentServiceId ?? 'APPOINTMENT', label: event.serviceSequence ? `Service ${event.serviceSequence} · ${event.serviceName}` : event.serviceName }])).values()] : [];
  const eventFilters = payload ? [...new Set(payload.events.map((event) => event.eventType))] : [];
  const filteredEvents = payload?.events.filter((event) => (serviceFilter === 'ALL' || (event.appointmentServiceId ?? 'APPOINTMENT') === serviceFilter) && (eventFilter === 'ALL' || event.eventType === eventFilter)) ?? [];

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal modal-wide turn-history-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="turn-history-title" tabIndex={-1}>
    <div className="modal-header"><div><div className="eyebrow">Appointment audit</div><h2 id="turn-history-title">Appointment history</h2><p>{appointment.code} · {appointment.customerName} · {appointment.phone}</p></div><button type="button" className="modal-close" aria-label="Close appointment history" onClick={onClose}><X size={19} aria-hidden="true" /></button></div>
    {loading ? <div className="history-empty turn-history-empty" role="status"><History size={26} aria-hidden="true" /><strong>Loading appointment history…</strong><span>Reading the assignment events for this appointment.</span></div> : error ? <div className="history-empty turn-history-empty" role="alert"><X size={26} aria-hidden="true" /><strong>Could not load history</strong><span>{error}</span><button type="button" className="button button-quiet button-sm" onClick={() => { setLoading(true); setError(''); setPayload(null); setRequestVersion((version) => version + 1); }}><RefreshCcw size={15} aria-hidden="true" />Retry</button></div> : payload ? <>
      <div className="turn-history-summary" aria-label="Appointment history summary"><span className="turn-history-summary-item"><strong>{payload.turnRecordCount}</strong> activity record{payload.turnRecordCount === 1 ? '' : 's'}</span><span className="turn-history-summary-item"><strong>{payload.eventCount}</strong> event{payload.eventCount === 1 ? '' : 's'} logged</span><StatusBadge label={payload.appointment.status.replaceAll('_', ' ')} tone={payload.appointment.status === 'COMPLETED' ? 'success' : payload.appointment.status === 'CANCELLED' ? 'neutral' : payload.appointment.status === 'IN_SERVICE' ? 'blue' : 'warning'} /></div>
      <div className="turn-history-filters"><div className="field"><label htmlFor="turn-history-service-filter">Service</label><select id="turn-history-service-filter" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="ALL">All services</option>{serviceFilters.map((service) => <option key={service.value} value={service.value}>{service.label}</option>)}</select></div><div className="field"><label htmlFor="turn-history-event-filter">Event</label><select id="turn-history-event-filter" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="ALL">All events</option>{eventFilters.map((eventType) => <option key={eventType} value={eventType}>{turnEventLabel(eventType)}</option>)}</select></div></div>
      {filteredEvents.length ? <ol className="turn-history-timeline" aria-label="Appointment events">{filteredEvents.map((event) => <li className={`turn-history-event turn-history-event-${event.eventType.toLowerCase()}`} key={event.id}><span className="turn-history-event-icon"><History size={18} aria-hidden="true" /></span><div className="turn-history-event-card"><div className="turn-history-event-head"><div><span className="turn-history-event-service">{event.serviceSequence ? `Service ${event.serviceSequence}` : 'Appointment activity'} · {event.serviceName}</span><h3>{turnEventLabel(event.eventType)}</h3></div><time className="turn-history-event-time" dateTime={event.createdAt}>{formatTurnEventDateTime(event.createdAt, timezone)}</time></div><div className="turn-history-event-meta"><div className="turn-history-event-person"><span>Assigned to</span><strong>{event.assignedStaffName ?? 'Waiting for eligible staff'}</strong></div><div className="turn-history-event-person"><span>Performed by</span><strong>{event.actorName}</strong>{event.actorName === 'Historical record' ? <small className="turn-history-historical-note">Actor details were not stored before history tracking was added.</small> : null}</div></div>{event.reason ? <p className="turn-history-event-reason">{event.reason}</p> : null}</div></li>)}</ol> : <div className="history-empty turn-history-empty"><History size={26} aria-hidden="true" /><strong>No events match these filters</strong><span>Choose another service or event type to see more activity.</span></div>}
    </> : null}
  </div></div>;
}
function formatAppointmentDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function PaymentsView({ appointments, currency, businessDate, businessMonth, refreshToken, onPayment, onChanged }: { appointments: Appointment[]; currency: string; businessDate: string; businessMonth: string; refreshToken: number; onPayment: (appointment: Appointment) => void; onChanged: () => Promise<void> }) {
  const defaultBusinessDate = businessDate || new Date().toISOString().slice(0, 10);
  const defaultBusinessMonth = businessMonth || defaultBusinessDate.slice(0, 7);
  const initialPaid = appointments.filter((appointment) => Boolean(appointment.payment)).sort((left, right) => new Date(right.payment?.confirmedAt ?? 0).getTime() - new Date(left.payment?.confirmedAt ?? 0).getTime());
  const [historyAppointment, setHistoryAppointment] = useState<Appointment | null>(null);
  const [historyRows, setHistoryRows] = useState<Appointment[]>(initialPaid);
  const [historyDateMode, setHistoryDateMode] = useState<AppointmentDateMode>('DAY');
  const [historyDate, setHistoryDate] = useState(defaultBusinessDate);
  const [historyMonth, setHistoryMonth] = useState(defaultBusinessMonth);
  const [historyFrom, setHistoryFrom] = useState(defaultBusinessDate);
  const [historyTo, setHistoryTo] = useState(defaultBusinessDate);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMethod, setHistoryMethod] = useState<'ALL' | 'CARD' | 'CASH'>('ALL');
  const [historySort, setHistorySort] = useState<'PAYMENT_NEWEST' | 'PAYMENT_OLDEST' | 'AMOUNT_DESC'>('PAYMENT_NEWEST');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyPagination, setHistoryPagination] = useState<AppointmentPageMeta>({ page: 1, pageSize: 25, total: initialPaid.length, totalPages: 1 });
  const [historySummary, setHistorySummary] = useState<AppointmentSummary>({ totalRevenue: initialPaid.reduce((total, appointment) => total + appointment.amount, 0), totalDuration: 0 });
  const historyRequestRef = useRef(0);
  const historyControllerRef = useRef<AbortController | null>(null);
  const lastHistoryRefreshTokenRef = useRef(refreshToken);
  const pending = appointments.filter((appointment) => appointment.status === 'PAYMENT_PENDING' && !appointment.payment);
  const activeHistoryFilterCount = [historyDateMode !== 'DAY' ? historyDateMode : '', historySearch.trim(), historyMethod !== 'ALL' ? historyMethod : '', historySort !== 'PAYMENT_NEWEST' ? historySort : ''].filter(Boolean).length;

  useEffect(() => () => historyControllerRef.current?.abort(), []);

  function buildHistoryQuery(page: number) {
    const params = new URLSearchParams();
    if (historyDateMode === 'MONTH') params.set('month', historyMonth);
    else if (historyDateMode === 'RANGE') { params.set('from', historyFrom); params.set('to', historyTo); }
    else params.set('date', historyDate);
    params.set('payment', 'PAID');
    params.set('page', String(page));
    params.set('pageSize', '25');
    if (historySearch.trim()) params.set('search', historySearch.trim());
    if (historyMethod !== 'ALL') params.set('paymentMethod', historyMethod);
    params.set('sort', historySort);
    return params.toString();
  }

  async function loadPaymentHistory(requestedPage = 1) {
    if (historyDateMode === 'RANGE' && (!historyFrom || !historyTo || historyFrom > historyTo)) { setHistoryError('Choose a valid payment date range.'); return; }
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    historyControllerRef.current?.abort();
    const controller = new AbortController();
    historyControllerRef.current = controller;
    setHistoryLoading(true); setHistoryError('');
    try {
      const response = await fetch(`/api/admin/appointments?${buildHistoryQuery(requestedPage)}`, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load payment history');
      if (requestId !== historyRequestRef.current) return;
      setHistoryRows(payload.appointments ?? []);
      setHistoryPagination(payload.pagination ?? { page: 1, pageSize: 25, total: payload.appointments?.length ?? 0, totalPages: 1 });
      setHistorySummary(payload.summary ?? { totalRevenue: 0, totalDuration: 0 });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === historyRequestRef.current) setHistoryError(error instanceof Error ? error.message : 'Unable to load payment history');
    } finally { if (requestId === historyRequestRef.current) setHistoryLoading(false); }
  }

  useEffect(() => {
    const shouldLoad = historyDateMode === 'DAY'
      ? Boolean(historyDate)
      : historyDateMode === 'MONTH'
        ? Boolean(historyMonth)
        : Boolean(historyFrom && historyTo && historyFrom <= historyTo);
    if (!shouldLoad) return;
    const timer = window.setTimeout(() => { void loadPaymentHistory(1); }, historySearch ? 250 : 0);
    return () => window.clearTimeout(timer);
    // The filter controls are the deliberate triggers for this server-backed payment history query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyDateMode, historyDate, historyMonth, historyFrom, historyTo, historySearch, historyMethod, historySort]);

  useEffect(() => {
    if (refreshToken === 0 || refreshToken === lastHistoryRefreshTokenRef.current) return;
    lastHistoryRefreshTokenRef.current = refreshToken;
    void loadPaymentHistory(historyPagination.page);
    // Parent refreshes are the deliberate signal after payment mutations or polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  function clearHistoryFilters() {
    setHistoryDateMode('DAY'); setHistoryDate(defaultBusinessDate); setHistoryMonth(defaultBusinessMonth); setHistoryFrom(defaultBusinessDate); setHistoryTo(defaultBusinessDate); setHistorySearch(''); setHistoryMethod('ALL'); setHistorySort('PAYMENT_NEWEST'); setHistoryError('');
  }

  return <>
    <SectionHeader eyebrow="Payment collection" title="Payments" description="Confirm the final amount after collection, then adjust the record later if needed." action={<StatusBadge label={`${pending.length} pending`} tone={pending.length ? 'warning' : 'success'} />} />
    <div className="card card-pad payment-screen-card">
      <section className="payment-pending-section" aria-labelledby="pending-payments-title">
        <div className="card-title-row"><div><h2 id="pending-payments-title" className="card-title">Pending payment</h2><p>Confirm only after the terminal or cash collection is complete.</p></div><span className="status-badge status-warning">{pending.length} pending</span></div>
        {pending.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Turn</th><th>Guest</th><th>Services</th><th>Total</th><th /></tr></thead><tbody>{pending.map((appointment) => <tr key={appointment.id}><td><strong>{appointment.code}</strong></td><td>{appointment.customerName}</td><td>{appointment.services.map((service) => service.serviceName).join(' + ')}</td><td><strong>{formatAdminMoney(appointment.amount, currency)}</strong></td><td><button className="button button-primary button-sm" onClick={() => onPayment(appointment)}><CreditCard size={15} aria-hidden="true" /> Confirm</button></td></tr>)}</tbody></table></div> : <div className="empty-state payment-empty-state"><CheckCircle2 size={28} aria-hidden="true" /><div><strong>All clear</strong><br /><span>No appointments are waiting for payment.</span></div></div>}
      </section>
      <section className="payment-history-section" aria-labelledby="payment-history-title">
        <div className="card-title-row"><div><h2 id="payment-history-title" className="card-title">Payment history</h2><p>The service fee stays as the original snapshot; the final collected amount and any adjustments remain in the audit trail.</p></div><span className="status-badge status-blue">{historyPagination.total} recorded</span></div>
        <div className="payment-history-filter-panel">
          <div className="payment-history-filter-top"><PaymentHistoryPeriodFilter mode={historyDateMode} date={historyDate} month={historyMonth} from={historyFrom} to={historyTo} onModeChange={(mode) => { setHistoryDateMode(mode); setHistoryError(''); }} onDateChange={(value) => { setHistoryDate(value); setHistoryError(''); }} onMonthChange={(value) => { setHistoryMonth(value); setHistoryError(''); }} onFromChange={(value) => { setHistoryFrom(value); setHistoryError(''); }} onToChange={(value) => { setHistoryTo(value); setHistoryError(''); }} loading={historyLoading} error={historyDateMode === 'RANGE' && (!historyFrom || !historyTo || historyFrom > historyTo) ? historyError : ''} />{historyLoading ? <span className="payment-history-loading" role="status" aria-live="polite"><RefreshCcw size={15} aria-hidden="true" className="spin" />Updating history…</span> : null}</div>
          <div className="payment-history-filter-grid">
            <div className="field payment-history-search-field"><label htmlFor="payment-history-search">Search payment history</label><div className="input-with-icon"><Search size={16} aria-hidden="true" /><input id="payment-history-search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Code, customer, phone" /></div></div>
            <div className="field"><label htmlFor="payment-history-method">Payment method</label><select id="payment-history-method" value={historyMethod} onChange={(event) => setHistoryMethod(event.target.value as typeof historyMethod)}><option value="ALL">All methods</option><option value="CARD">Card</option><option value="CASH">Cash</option></select></div>
            <div className="field"><label htmlFor="payment-history-sort">Sort by</label><select id="payment-history-sort" value={historySort} onChange={(event) => setHistorySort(event.target.value as typeof historySort)}><option value="PAYMENT_NEWEST">Newest confirmed</option><option value="PAYMENT_OLDEST">Oldest confirmed</option><option value="AMOUNT_DESC">Highest amount</option></select></div>
          </div>
          <div className="appointment-filter-footer"><div className="appointment-summary"><strong>{historyPagination.total}</strong> recorded · <strong>{formatAdminMoney(historySummary.totalRevenue, currency)}</strong> service total</div><div className="appointment-filter-actions"><span className="subtle" role="status" aria-live="polite"><SlidersHorizontal size={14} aria-hidden="true" />{activeHistoryFilterCount ? `${activeHistoryFilterCount} filters active` : 'No filters applied'}</span>{activeHistoryFilterCount ? <button type="button" className="button button-quiet button-sm" onClick={clearHistoryFilters}><X size={15} aria-hidden="true" />Clear</button> : null}</div></div>
        </div>
        {historyError ? <div className="management-error payment-history-error" role="alert"><span>{historyError}</span><button type="button" className="button button-quiet button-sm" onClick={() => void loadPaymentHistory(historyPagination.page)}>Retry</button></div> : null}
        {historyRows.length ? <div className="admin-table-wrap" aria-busy={historyLoading}><table className="admin-table payment-history-table"><thead><tr><th>Turn</th><th>Guest</th><th>Collected</th><th>Method</th><th>Confirmed</th><th /></tr></thead><tbody>{historyRows.map((appointment) => <tr key={appointment.id}><td><strong>{appointment.code}</strong></td><td>{appointment.customerName}</td><td><strong>{formatAdminMoney((appointment.payment?.amount ?? appointment.amount) + (appointment.payment?.tip ?? 0), currency)}</strong></td><td><span className="payment-method-label-inline">{appointment.payment?.method === 'CARD' ? <CreditCard size={15} aria-hidden="true" /> : <Banknote size={15} aria-hidden="true" />}{appointment.payment?.method === 'CARD' ? 'Card' : 'Cash'}</span></td><td className="subtle">{appointment.payment?.confirmedAt ? formatAppointmentDateTime(appointment.payment.confirmedAt) : '—'}</td><td><button type="button" className="button button-quiet button-sm" onClick={() => setHistoryAppointment(appointment)}><History size={15} aria-hidden="true" /> View history</button></td></tr>)}</tbody></table></div> : historyLoading ? <div className="empty-state payment-empty-state" role="status"><RefreshCcw size={28} aria-hidden="true" className="spin" /><div><strong>Loading payment history…</strong><br /><span>Applying the selected filters.</span></div></div> : <div className="empty-state payment-empty-state"><History size={28} aria-hidden="true" /><div><strong>No payment history matches</strong><br /><span>Try another date, method, or search term.</span></div></div>}
        {historyPagination.total > historyPagination.pageSize ? <nav className="appointment-pagination" aria-label="Payment history pagination"><span className="subtle">Showing {((historyPagination.page - 1) * historyPagination.pageSize) + 1}–{Math.min(historyPagination.page * historyPagination.pageSize, historyPagination.total)} of {historyPagination.total}</span><div className="appointment-pagination-actions"><button type="button" className="button button-quiet button-sm" onClick={() => void loadPaymentHistory(historyPagination.page - 1)} disabled={historyLoading || historyPagination.page <= 1} aria-label="Previous payment history page"><ChevronLeft size={16} aria-hidden="true" />Previous</button><span className="subtle" aria-live="polite">Page {historyPagination.page} of {historyPagination.totalPages}</span><button type="button" className="button button-quiet button-sm" onClick={() => void loadPaymentHistory(historyPagination.page + 1)} disabled={historyLoading || historyPagination.page >= historyPagination.totalPages} aria-label="Next payment history page">Next<ChevronRight size={16} aria-hidden="true" /></button></div></nav> : null}
      </section>
    </div>
    {historyAppointment ? <PaymentHistoryModal appointment={historyAppointment} currency={currency} onClose={() => setHistoryAppointment(null)} onChanged={onChanged} /> : null}
  </>;
}

function paymentMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function paymentEventTitle(action: string) {
  if (action === 'payment.confirmed') return 'Payment recorded';
  if (action === 'payment.adjusted') return 'Payment adjusted';
  if (action === 'payment.corrected') return 'Payment record corrected';
  if (action === 'payment.refunded') return 'Refund recorded';
  return action.replace('payment.', '').replaceAll('_', ' ');
}

function paymentEventSummary(event: PaymentHistoryEvent, currency: string) {
  const metadata = paymentMetadataObject(event.metadata);
  if (event.action === 'payment.adjusted') {
    const previous = paymentMetadataObject(metadata.previous);
    const current = paymentMetadataObject(metadata.current);
    const previousMethod = previous.method === 'CARD' ? 'Card' : 'Cash';
    const currentMethod = current.method === 'CARD' ? 'Card' : 'Cash';
    const previousAmount = Number(previous.amount ?? 0);
    const currentAmount = Number(current.amount ?? 0);
    const previousTip = Number(previous.tip ?? 0);
    const currentTip = Number(current.tip ?? 0);
    const cashSummary = current.cashReceived !== null && current.cashReceived !== undefined
      ? ` · cash ${formatAdminMoney(Number(current.cashReceived ?? 0), currency)} · change ${formatAdminMoney(Number(current.changeGiven ?? 0), currency)}`
      : '';
    return `amount ${formatAdminMoney(previousAmount, currency)} → ${formatAdminMoney(currentAmount, currency)} · ${previousMethod} → ${currentMethod} · tip ${formatAdminMoney(previousTip, currency)} → ${formatAdminMoney(currentTip, currency)}${cashSummary}${typeof metadata.reason === 'string' ? ` · ${metadata.reason}` : ''}`;
  }
  if (event.action === 'payment.corrected') {
    const previous = paymentMetadataObject(metadata.previous);
    const current = paymentMetadataObject(metadata.current);
    const previousMethod = previous.method === 'CARD' ? 'Card' : 'Cash';
    const currentMethod = current.method === 'CARD' ? 'Card' : 'Cash';
    const previousTip = Number(previous.tip ?? 0);
    const currentTip = Number(current.tip ?? 0);
    return `${previousMethod} → ${currentMethod} · tip ${formatAdminMoney(previousTip, currency)} → ${formatAdminMoney(currentTip, currency)}${typeof metadata.reason === 'string' ? ` · ${metadata.reason}` : ''}`;
  }
  if (event.action === 'payment.refunded') {
    const refundMethod = metadata.refundMethod === 'CARD' ? 'Card' : metadata.refundMethod === 'CASH' ? 'Cash' : 'original method';
    return `${formatAdminMoney(Number(metadata.amount ?? 0), currency)} returned via ${refundMethod}${typeof metadata.reason === 'string' ? ` · ${metadata.reason}` : ''}`;
  }
  const method = metadata.method === 'CARD' ? 'Card' : 'Cash';
  const amount = Number(metadata.amount ?? metadata.originalAmount ?? 0);
  const originalAmount = Number(metadata.originalAmount ?? amount);
  const tip = Number(metadata.tip ?? 0);
  const cashSummary = metadata.cashReceived !== null && metadata.cashReceived !== undefined
    ? ` · cash ${formatAdminMoney(Number(metadata.cashReceived ?? 0), currency)} · change ${formatAdminMoney(Number(metadata.changeGiven ?? 0), currency)}`
    : '';
  const amountSummary = Math.abs(originalAmount - amount) > 0.005
    ? `service fee ${formatAdminMoney(originalAmount, currency)} → ${formatAdminMoney(amount, currency)}`
    : formatAdminMoney(amount, currency);
  const adjustmentSummary = typeof metadata.adjustmentReason === 'string' ? ` · ${metadata.adjustmentReason}` : '';
  return `${method} · ${amountSummary}${tip ? ` + ${formatAdminMoney(tip, currency)} tip` : ''}${cashSummary}${adjustmentSummary}`;
}

function PaymentHistoryModal({ appointment, currency, onClose, onChanged }: { appointment: Appointment; currency: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [payload, setPayload] = useState<PaymentHistoryPayload | null>(null);
  const [mode, setMode] = useState<'VIEW' | 'ADJUST'>('VIEW');
  const [method, setMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [amount, setAmount] = useState('0');
  const [tip, setTip] = useState('0');
  const [cashReceived, setCashReceived] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialogRef = useDialogFocus(true, onClose);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/payments/${encodeURIComponent(appointment.id)}/history`, { cache: 'no-store', signal });
      const nextPayload = await response.json();
      if (!response.ok) throw new Error(nextPayload.error ?? 'Unable to load payment history');
      setPayload(nextPayload as PaymentHistoryPayload);
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load payment history');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [appointment.id]);

  useEffect(() => {
    const controller = new AbortController();
    // Opening the modal intentionally starts the external payment history request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  function startAdjustment() {
    if (!payload) return;
    setMethod(payload.payment.method);
    setAmount(String(payload.payment.amount));
    setTip(String(payload.payment.tip));
    setCashReceived(payload.payment.cashReceived === null ? '' : String(payload.payment.cashReceived));
    setReason('');
    setNotice('');
    setError('');
    setMode('ADJUST');
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const numericAmount = Number(amount);
    const numericTip = Number(tip);
    const numericCashReceived = cashReceived.trim() ? Number(cashReceived) : undefined;
    if (!Number.isFinite(numericAmount) || numericAmount < 0) { setError('Enter a valid non-negative final amount.'); return; }
    if (!Number.isFinite(numericTip) || numericTip < 0) { setError('Enter a valid non-negative tip.'); return; }
    if (method === 'CASH' && numericCashReceived !== undefined && (!Number.isFinite(numericCashReceived) || numericCashReceived < numericAmount + numericTip)) { setError('Cash received cannot be less than the total due.'); return; }
    if (reason.trim().length < 2) { setError('Enter a reason before saving.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/payments/adjust', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appointmentId: appointment.id, method, amount: numericAmount, tip: numericTip, cashReceived: method === 'CASH' ? numericCashReceived : undefined, reason: reason.trim(), idempotencyKey: `payment-adjustment-${appointment.id}-${Date.now()}` }) });
      const responsePayload = await response.json();
      if (!response.ok) throw new Error(responsePayload.error ?? 'Payment action could not be completed');
      setNotice(responsePayload.message ?? 'Payment updated.');
      setReason('');
      setMode('VIEW');
      await onChanged();
      await loadHistory();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Payment action could not be completed');
    } finally {
      setBusy(false);
    }
  }

  const statusTone = payload?.payment.status === 'PAID' ? 'success' : payload?.payment.status === 'REFUNDED' ? 'neutral' : 'warning';
  return <div className="modal-backdrop"><div className="modal payment-history-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="payment-history-modal-title">
    <div className="modal-header"><div><div className="eyebrow">Payment audit</div><h2 id="payment-history-modal-title">{appointment.code} payment history</h2><p>{appointment.customerName} · {appointment.services.map((service) => service.serviceName).join(' + ')}</p></div><button type="button" className="modal-close" aria-label="Close payment history" onClick={onClose}><X size={19} aria-hidden="true" /></button></div>
    {loading ? <div className="history-empty" role="status"><History size={26} aria-hidden="true" /><strong>Loading payment history…</strong><span>Reading confirmed and adjusted events.</span></div> : error && !payload ? <div className="history-empty" role="alert"><X size={26} aria-hidden="true" /><strong>Could not load payment history</strong><span>{error}</span><button type="button" className="button button-quiet button-sm" onClick={() => void loadHistory()}><RefreshCcw size={15} aria-hidden="true" />Retry</button></div> : payload ? <>
      <div className="payment-history-summary"><div><span>Original fee</span><strong>{formatAdminMoney(payload.payment.originalAmount, currency)}</strong></div><div><span>Final amount</span><strong>{formatAdminMoney(payload.payment.amount, currency)}</strong></div><div><span>Tip</span><strong>{formatAdminMoney(payload.payment.tip, currency)}</strong></div><div><span>Paid via</span><strong>{payload.payment.method === 'CARD' ? 'Card' : 'Cash'}</strong></div>{payload.payment.method === 'CASH' && payload.payment.cashReceived !== null ? <div><span>Change</span><strong>{formatAdminMoney(payload.payment.changeGiven, currency)}</strong></div> : null}<StatusBadge label={payload.payment.status.replaceAll('_', ' ')} tone={statusTone} /></div>
      {notice ? <div className="payment-action-notice" role="status">{notice}</div> : null}
      {mode === 'VIEW' ? <>
        <div className="payment-history-timeline" aria-label="Payment events">{payload.events.slice().reverse().map((event) => <article className="payment-history-event" key={event.id}><span className="payment-history-event-icon">{event.action === 'payment.refunded' ? <Undo2 size={17} aria-hidden="true" /> : event.action === 'payment.adjusted' || event.action === 'payment.corrected' ? <Pencil size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}</span><div><div className="payment-history-event-head"><strong>{paymentEventTitle(event.action)}</strong><time dateTime={event.createdAt}>{formatAppointmentDateTime(event.createdAt)}</time></div><p>{paymentEventSummary(event, currency)}</p><small>Performed by {event.actorName}</small></div></article>)}</div>
        <p className="field-hint payment-history-help">Adjust payment updates the saved final amount, method, tip, or cash details. Before/after values, reason, and the admin who made the change remain in history.</p>
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={onClose}>Close</button><button type="button" className="button button-primary" onClick={startAdjustment}><Pencil size={15} aria-hidden="true" /> Adjust payment</button></div>
      </> : <form className="payment-action-form" onSubmit={submitAction}>
        <div className="payment-action-banner"><strong>Adjust saved payment</strong><span>Update the final collected amount, payment method, tip, or cash details. The original service fee stays unchanged for audit and reporting.</span></div>
        <div className="field"><label htmlFor="payment-adjustment-amount">Final amount ({currency})</label><input id="payment-adjustment-amount" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><span className="field-hint">Original service fee: {formatAdminMoney(payload.payment.originalAmount, currency)}.</span></div>
        <div className="field payment-method-field"><span id="payment-adjustment-method-label" className="payment-method-label">Payment method</span><div className="payment-method-options" role="group" aria-labelledby="payment-adjustment-method-label"><button type="button" className={`payment-method-option ${method === 'CASH' ? 'active' : ''}`} aria-pressed={method === 'CASH'} disabled={busy} onClick={() => setMethod('CASH')}><Banknote size={20} aria-hidden="true" />Cash</button><button type="button" className={`payment-method-option ${method === 'CARD' ? 'active' : ''}`} aria-pressed={method === 'CARD'} disabled={busy} onClick={() => setMethod('CARD')}><CreditCard size={20} aria-hidden="true" />Card</button></div></div>
        <div className="field"><label htmlFor="payment-adjustment-tip">Tip ({currency})</label><input id="payment-adjustment-tip" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={tip} onChange={(event) => setTip(event.target.value)} /><span className="field-hint">Recorded separately from the service amount.</span></div>
        {method === 'CASH' ? <div className="field"><label htmlFor="payment-adjustment-cash">Cash received ({currency})</label><input id="payment-adjustment-cash" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="Leave blank to use exact cash" /><span className="field-hint">Must cover the final amount plus tip. Change is calculated automatically.</span></div> : null}
        <PaymentPreview amount={amount} tip={tip} method={method} cashReceived={cashReceived} currency={currency} />
        <div className="field"><label htmlFor="payment-action-reason">Reason for adjustment</label><textarea id="payment-action-reason" rows={3} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Discount, wrong amount, wrong method, or cash correction…" required /><span className="field-hint">Required so the next admin can understand what changed.</span></div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => { setMode('VIEW'); setError(''); }}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save adjustment'}</button></div>
      </form>}
    </> : null}
  </div></div>;
}

type AppointmentActionMode = 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION';
function AppointmentActionMenu({ appointmentCode, hasPendingPayment, canCancel, canChangeService, canReassign, hasExclusion, onHistory, onPayment, onAction }: { appointmentCode: string; hasPendingPayment: boolean; canCancel: boolean; canChangeService: boolean; canReassign: boolean; hasExclusion: boolean; onHistory: () => void; onPayment: () => void; onAction: (mode: AppointmentActionMode) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const positionMenu = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 240;
    const menuHeight = menuRef.current?.offsetHeight ?? 260;
    const viewportPadding = 12;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    const left = Math.min(Math.max(viewportPadding, triggerRect.right - menuWidth), maxLeft);
    const opensBelow = triggerRect.bottom + 8 + menuHeight <= window.innerHeight - viewportPadding;
    const top = opensBelow ? triggerRect.bottom + 8 : Math.max(viewportPadding, triggerRect.top - menuHeight - 8);
    setPosition({ top, left });
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const reposition = () => positionMenu();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (!items.length) return;
      const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        items[(currentIndex + offset + items.length) % items.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const frame = window.requestAnimationFrame(() => { reposition(); menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(); });
    return () => { document.removeEventListener('pointerdown', handlePointerDown, true); document.removeEventListener('keydown', handleKeyDown); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); window.cancelAnimationFrame(frame); };
  }, [closeMenu, open, positionMenu]);

  function run(action: () => void) { closeMenu(); action(); }
  return <>
    <button ref={triggerRef} type="button" className="appointment-action-trigger" aria-label={`Open actions for appointment ${appointmentCode}`} aria-haspopup="menu" aria-expanded={open} title="Appointment actions" onClick={() => { if (open) closeMenu(); else { positionMenu(); setOpen(true); } }} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!open) { positionMenu(); setOpen(true); } } }}><MoreHorizontal size={21} strokeWidth={2.2} aria-hidden="true" /></button>
    {open ? <div ref={menuRef} className="appointment-action-menu" role="menu" aria-label={`Actions for appointment ${appointmentCode}`} style={{ top: position.top, left: position.left }}>
      {hasPendingPayment ? <><button type="button" role="menuitem" className="appointment-action-menu-item appointment-action-menu-primary" onClick={() => run(onPayment)}><CreditCard size={17} aria-hidden="true" /><span>Confirm payment</span></button><div className="appointment-action-menu-divider" role="separator" /></> : null}
      <button type="button" role="menuitem" className="appointment-action-menu-item" onClick={() => run(onHistory)}><History size={17} aria-hidden="true" /><span>History</span></button>
      {canChangeService ? <button type="button" role="menuitem" className="appointment-action-menu-item" onClick={() => run(() => onAction('CHANGE_SERVICE'))}><Scissors size={17} aria-hidden="true" /><span>Change service</span></button> : null}
      {canReassign ? <button type="button" role="menuitem" className="appointment-action-menu-item" onClick={() => run(() => onAction('REASSIGN'))}><UserCog size={17} aria-hidden="true" /><span>Reassign staff</span></button> : null}
      {hasExclusion ? <button type="button" role="menuitem" className="appointment-action-menu-item" onClick={() => run(() => onAction('OVERRIDE_EXCLUSION'))}><SlidersHorizontal size={17} aria-hidden="true" /><span>Override skip</span></button> : null}
      {canCancel ? <><div className="appointment-action-menu-divider" role="separator" /><button type="button" role="menuitem" className="appointment-action-menu-item appointment-action-menu-danger" onClick={() => run(() => onAction('CANCEL'))}><X size={17} aria-hidden="true" /><span>Cancel appointment</span></button></> : null}
    </div> : null}
  </>;
}
