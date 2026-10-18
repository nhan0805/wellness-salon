'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, ClipboardList, Clock3, LogIn, LogOut, MessageSquareWarning, Plus, RefreshCcw, Scissors, Search, ShieldCheck, Sparkles, UserCheck, Users, X } from 'lucide-react';
import { InitialsAvatar } from '@/src/components/ui';
import { AccountMenu } from '@/src/components/account-menu';
import { PinKeypad } from '@/src/components/pin-keypad';
import { SignOutButton } from '@/src/components/sign-out-button';
import SafariLoginLink from '@/src/components/safari-login-link';
import { useDialogFocus } from '@/src/components/use-dialog-focus';
import { getApiErrorMessage, parseApiResponse } from '@/src/client/api-response';
import type { AccountViewer } from '@/src/domain/viewer';
import { DEFAULT_TIMEZONE } from '@/src/domain/locale-options';
import { BOARD_POLL_INTERVAL_MS, BOARD_STALE_AFTER_MS } from '@/src/domain/realtime';

type Staff = { id: string; name: string; initials: string; isPresent: boolean; availability: 'AVAILABLE' | 'BUSY'; skills: string[] };
type AppointmentService = {
  id: string;
  sequence: number;
  serviceName: string;
  durationMin: number;
  status: string;
  primaryStaffId: string | null;
  primaryStaff: { id: string; name: string; initials: string } | null;
  turns: Array<{ status: string; reason: string | null; skipReasonNameSnapshot?: string | null }>;
  turnExclusions: Array<{ staffId: string; staffName: string; reason: string }>;
};
type Appointment = { id: string; code: string; customerName: string; serviceName: string; durationMin: number; amount: number; status: string; primaryStaffId: string | null; createdAt: string; supportingStaffIds: string[]; turns: Array<{ status: string; reason: string | null; skipReasonNameSnapshot?: string | null }>; services: AppointmentService[] };
type BoardState = { current: Appointment | null; currentTurns: Appointment[]; upNext: Appointment[]; staff: Staff[]; skipReasons: Array<{ id: string; name: string }>; shop: { timezone: string; openingTime: string; closingTime: string; currency: string }; version: number; at: string; viewerRole: 'ADMIN' | 'STATION' | null; viewer: AccountViewer | null };
type Action = 'ACCEPT' | 'SKIP' | 'FINISH' | 'CHECK_IN' | 'CHECK_OUT' | 'ADD_SUPPORT' | 'CONTINUE_WITH_ME';
type BoardTab = 'turns' | 'staff';
type AttendanceAction = Extract<Action, 'CHECK_IN' | 'CHECK_OUT'>;
type SyncStatus = 'POLLING' | 'RECONNECTING' | 'STALE';
type StaffVerification = { staffId: string; staffName: string; expiresAt: number };

const emptyBoard: BoardState = { current: null, currentTurns: [], upNext: [], staff: [], skipReasons: [], shop: { timezone: DEFAULT_TIMEZONE, openingTime: '09:00', closingTime: '21:00', currency: 'USD' }, version: 0, at: '', viewerRole: null, viewer: null };

function formatVerificationRemaining(expiresAt: number, now = Date.now()) {
  const totalSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function StaffAttendancePanel({ staff, viewerRole, onAction }: { staff: Staff[]; viewerRole: BoardState['viewerRole']; onAction: (action: AttendanceAction, staffId: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const presentCount = staff.filter((member) => member.isPresent).length;
  const availableCount = staff.filter((member) => member.isPresent && member.availability === 'AVAILABLE').length;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredStaff = normalizedQuery ? staff.filter((member) => member.name.toLowerCase().includes(normalizedQuery)) : staff;
  const clearSearch = () => setSearchQuery('');

  const staffCards = filteredStaff.map((member) => <article className="staff-attendance-card" key={member.id}>
    <div className="staff-attendance-identity"><InitialsAvatar initials={member.initials} tone={member.availability === 'BUSY' ? 'orange' : 'teal'} /><div className="staff-row-body"><strong>{member.name}</strong><small>{member.isPresent ? member.availability === 'BUSY' ? 'Serving a guest' : 'Ready for the next guest' : 'Not checked in today'}</small></div><span className={'status-badge ' + (member.isPresent ? member.availability === 'BUSY' ? 'status-warning' : 'status-success' : 'status-neutral')}>{member.isPresent ? member.availability === 'BUSY' ? 'Busy' : 'Available' : 'Away'}</span></div>
    {viewerRole ? <button type="button" className={'button ' + (member.isPresent ? 'button-primary' : 'button-secondary') + ' staff-attendance-action'} onClick={() => onAction(member.isPresent ? 'CHECK_OUT' : 'CHECK_IN', member.id)}>{member.isPresent ? <LogOut size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}{member.isPresent ? 'Check out' : 'Check in'}</button> : null}
  </article>);

  return <section className="card card-pad staff-attendance-panel" aria-labelledby="staff-attendance-title">
    <div className="card-title-row staff-attendance-header"><div className="staff-attendance-heading"><h2 className="card-title" id="staff-attendance-title">Staff attendance</h2><p>Check specialists in for the day or check them out when their work is complete.</p><div className="staff-attendance-summary"><span className="status-badge status-success">{presentCount} present</span><span className="status-badge status-blue">{availableCount} available</span></div></div><div className="staff-attendance-header-tools"><label className="staff-search-field"><Search size={17} aria-hidden="true" /><span className="staff-search-label">Find staff</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Type a name…" aria-label="Search staff by name" />{searchQuery ? <button type="button" className="staff-search-clear" onClick={clearSearch} aria-label="Clear staff search"><X size={17} aria-hidden="true" /></button> : null}</label></div></div>
    <span className="sr-only" aria-live="polite">{normalizedQuery ? `${filteredStaff.length} staff ${filteredStaff.length === 1 ? 'member' : 'members'} found` : ''}</span>
    {!viewerRole ? <div className="staff-attendance-login" role="note"><Users size={20} aria-hidden="true" /><div><strong>Staff actions are protected</strong><span>Sign in to manage attendance and verify each action with a staff PIN.</span></div><SafariLoginLink className="button button-secondary button-sm" href="/sign-in"><LogIn size={15} aria-hidden="true" /> Log in</SafariLoginLink></div> : null}
    {staff.length ? filteredStaff.length ? <div className="staff-attendance-grid">{staffCards}</div> : <div className="empty-state staff-search-empty"><Search size={27} aria-hidden="true" /><div><strong>No staff found</strong><span>Try another name or clear your search.</span><button type="button" className="button button-quiet button-sm" onClick={clearSearch}>Clear search</button></div></div> : <div className="empty-state"><Users size={28} aria-hidden="true" /><span>No active staff records.</span></div>}
  </section>;
}

function StaffAvailabilityRail({ staff }: { staff: Staff[] }) {
  const presentCount = staff.filter((member) => member.isPresent).length;
  const availableCount = staff.filter((member) => member.isPresent && member.availability === 'AVAILABLE').length;
  const visibleStaff = staff
    .filter((member) => member.isPresent)
    .sort((left, right) => Number(left.availability === 'BUSY') - Number(right.availability === 'BUSY'))
    .slice(0, 5);

  return <section className="card card-pad staff-availability-rail" aria-labelledby="staff-availability-title">
    <div className="card-title-row">
      <div>
        <div className="eyebrow">Team pulse</div>
        <h2 className="card-title" id="staff-availability-title">Staff availability</h2>
        <p>Who is ready for the next service.</p>
      </div>
      <span className="status-badge status-success">{availableCount} ready</span>
    </div>
    <div className="staff-availability-summary" aria-label={`${presentCount} staff checked in, ${availableCount} available`}>
      <strong>{presentCount}</strong>
      <span>checked in</span>
    </div>
    {visibleStaff.length ? <div className="staff-availability-list">
      {visibleStaff.map((member) => <div className="staff-availability-row" key={member.id}>
        <InitialsAvatar initials={member.initials} tone={member.availability === 'BUSY' ? 'orange' : 'teal'} />
        <div>
          <strong>{member.name}</strong>
          <span>{member.availability === 'BUSY' ? 'Serving a guest' : 'Ready for next guest'}</span>
        </div>
        <span className={`staff-availability-dot ${member.availability === 'BUSY' ? 'is-busy' : 'is-ready'}`} aria-label={member.availability === 'BUSY' ? 'Busy' : 'Available'} />
      </div>)}
    </div> : <div className="staff-availability-empty">
      <Users size={20} aria-hidden="true" />
      <span>No staff checked in yet.</span>
    </div>}
    {presentCount > visibleStaff.length ? <span className="staff-availability-more">+{presentCount - visibleStaff.length} more on the Staff tab</span> : null}
  </section>;
}

export default function BoardPage() {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  const [modal, setModal] = useState<{ action: Action; appointmentId?: string; appointmentServiceId?: string; staffId?: string; idempotencyKey: string } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [skipReasonId, setSkipReasonId] = useState('');
  const [notice, setNotice] = useState('');
  const [boardNotice, setBoardNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [boardError, setBoardError] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('POLLING');
  const [activeTab, setActiveTab] = useState<BoardTab>('turns');
  const [expandedQueueItems, setExpandedQueueItems] = useState<Record<string, boolean>>({});
  const [verifiedStaffSession, setVerifiedStaffSession] = useState<StaffVerification | null>(null);
  const [verificationNow, setVerificationNow] = useState(() => Date.now());
  const actionSequenceRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const actionSubmitInFlightRef = useRef(false);
  const latestVersionRef = useRef(0);
  const hasApiSnapshotRef = useRef(false);
  const lastSuccessAtRef = useRef<number>(0);

  const availableStaff = board.staff.filter((member) => member.isPresent && member.availability === 'AVAILABLE');
  const modalStaff = modal?.action === 'ADD_SUPPORT' ? availableStaff : board.staff;
  const selectedStaffIsValid = modalStaff.some((member) => member.id === selectedStaffId);
  const selectedStaff = modalStaff.find((member) => member.id === selectedStaffId);
  const activeVerifiedStaff = verifiedStaffSession && verifiedStaffSession.expiresAt > verificationNow ? verifiedStaffSession : null;
  const selectedStaffIsVerified = Boolean(activeVerifiedStaff && selectedStaff && activeVerifiedStaff.staffId === selectedStaff.id);
  const staffSelectionLocked = Boolean(modal && ['ACCEPT', 'SKIP', 'FINISH', 'CONTINUE_WITH_ME'].includes(modal.action));
  const verificationActionLabel = modal ? ({ ACCEPT: 'accept this service', SKIP: 'skip this service', FINISH: 'finish this service', CHECK_IN: 'check in', CHECK_OUT: 'check out', ADD_SUPPORT: 'add support', CONTINUE_WITH_ME: 'continue with this specialist' } as const)[modal.action] : '';
  const pinCanSubmit = selectedStaffIsVerified ? pin.length === 0 || pin.length === 4 : pin.length === 4;

  useEffect(() => {
    if (!verifiedStaffSession) return;
    const timer = window.setInterval(() => setVerificationNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [verifiedStaffSession]);

  const closeActionModal = useCallback(() => {
    setModal(null);
    setSelectedStaffId('');
    setPin('');
    setReason('');
    setSkipReasonId('');
    setNotice('');
  }, []);

  const dialogRef = useDialogFocus(Boolean(modal), closeActionModal);

  const loadBoard = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const requestSequence = ++requestSequenceRef.current;
    requestControllerRef.current?.abort();
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    requestControllerRef.current = controller;
    setSyncStatus((current) => current === 'RECONNECTING' ? current : 'POLLING');
    let timedOut = false;
    let timeoutId: number | undefined;
    try {
      // The SSE bootstrap can arrive before this request and its payload may
      // already have the same version. Keep the first API response full so
      // auth-specific viewer metadata can never be skipped by a 304.
      const since = hasApiSnapshotRef.current && latestVersionRef.current > 0
        ? `?since=${latestVersionRef.current}`
        : '';
      const request = fetch(`/api/board${since}`, {
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true;
          controller?.abort();
          reject(new Error('The live queue is taking too long to load.'));
        }, 12_000);
      });
      const response = await Promise.race([request, timeout]);
      if (response.status === 304) {
        if (requestSequence !== requestSequenceRef.current) return;
        setBoardLoaded(true);
        setBoardError('');
        setSyncStatus('POLLING');
        lastSuccessAtRef.current = Date.now();
        return;
      }
      const nextBoard = await parseApiResponse<BoardState>(response, 'Unable to load the live board');
      if (requestSequence !== requestSequenceRef.current) return;
      if (nextBoard.version < latestVersionRef.current) return;
      latestVersionRef.current = nextBoard.version;
      hasApiSnapshotRef.current = true;
      setBoard(nextBoard);
      setBoardLoaded(true);
      setBoardError('');
      setSyncStatus('POLLING');
      lastSuccessAtRef.current = Date.now();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (requestSequence !== requestSequenceRef.current) return;
      setBoardError(
        timedOut
          ? 'The live queue is taking too long to load. Check the tablet connection and try again.'
          : getApiErrorMessage(error, 'Unable to load the live board'),
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  // Board state is synchronized from SSE and the polling fallback.
  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    const clearReconnectTimer = () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    };
    const connect = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      clearReconnectTimer();
      source?.close();
      source = new EventSource('/api/sse/board');
      source.onopen = () => { reconnectAttempt = 0; setSyncStatus('POLLING'); };
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; payload?: BoardState };
          if (payload.type !== 'board.snapshot' || !payload.payload) return;
          const nextBoard = payload.payload;
          if (nextBoard.version < latestVersionRef.current) return;
          latestVersionRef.current = nextBoard.version;
          setBoard(nextBoard);
          setBoardLoaded(true);
          setBoardError('');
          setSyncStatus('POLLING');
          lastSuccessAtRef.current = Date.now();
        } catch {
          void loadBoard();
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        setSyncStatus('RECONNECTING');
        reconnectAttempt += 1;
        const backoff = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt, 5)));
        reconnectTimer = window.setTimeout(connect, backoff + Math.floor(Math.random() * 500));
      };
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        source?.close();
        source = null;
        clearReconnectTimer();
        requestControllerRef.current?.abort();
        return;
      }
      reconnectAttempt = 0;
      void loadBoard();
      connect();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const initialLoad = window.setTimeout(() => { void loadBoard(); }, 0);
    // A newly checked-in visit can be routed by the same command that created
    // it. Give the board one short convergence refresh after the initial SSE
    // snapshot, then stay on the low-frequency fallback below. This preserves
    // fast queue actions without returning to a 3-second D1 polling loop.
    const convergenceRefresh = window.setTimeout(() => { void loadBoard(); }, 1_000);
    connect();
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadBoard();
    }, BOARD_POLL_INTERVAL_MS);
    const staleCheck = window.setInterval(() => {
      if (document.visibilityState === 'visible' && lastSuccessAtRef.current && Date.now() - lastSuccessAtRef.current > BOARD_STALE_AFTER_MS) setSyncStatus('STALE');
    }, BOARD_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      source?.close();
      clearReconnectTimer();
      window.clearTimeout(initialLoad);
      window.clearTimeout(convergenceRefresh);
      window.clearInterval(poll);
      window.clearInterval(staleCheck);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      requestControllerRef.current?.abort();
    };
  }, [loadBoard]);

  const currentTurns = board.currentTurns.length ? board.currentTurns : board.current ? [board.current] : [];
  const currentServiceCount = currentTurns.reduce((count, appointment) => {
    const activeCount = servicesForAppointment(appointment).filter((service) => service.status === 'IN_SERVICE').length;
    return count + (activeCount || appointment.status === 'PAYMENT_PENDING' ? 1 : 0);
  }, 0);

  function servicesForAppointment(appointment: Appointment) {
    return appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, sequence: 1, serviceName: appointment.serviceName, durationMin: appointment.durationMin, status: appointment.status, primaryStaffId: appointment.primaryStaffId, primaryStaff: null, turns: appointment.turns, turnExclusions: [] }];
  }

  function staffForService(service: AppointmentService): { id: string; name: string; initials: string } | null {
    return service.primaryStaff ?? (service.primaryStaffId ? board.staff.find((member) => member.id === service.primaryStaffId) ?? null : null);
  }

  function toggleQueueServices(appointmentId: string) {
    setExpandedQueueItems((current) => ({ ...current, [appointmentId]: !current[appointmentId] }));
  }

  async function submitAction(event?: React.FormEvent<HTMLFormElement>, submittedPin = pin) {
    event?.preventDefault();
    const submittedPinCanSubmit = selectedStaffIsVerified
      ? submittedPin.length === 0 || submittedPin.length === 4
      : submittedPin.length === 4;
    if (!modal || !selectedStaffIsValid || !submittedPinCanSubmit || loading || actionSubmitInFlightRef.current) return;
    actionSubmitInFlightRef.current = true;
    setLoading(true);
    setNotice('');
    try {
      const response = await fetch('/api/board', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: modal.action,
          appointmentId: modal.appointmentId,
          appointmentServiceId: modal.appointmentServiceId,
          staffId: selectedStaffId,
          pin: submittedPin || undefined,
          reason: reason || undefined,
          skipReasonId: modal.action === 'SKIP' ? skipReasonId : undefined,
          idempotencyKey: modal.idempotencyKey,
        }),
      });
      const payload = await parseApiResponse<{
        appointment?: { code?: string };
        verifiedStaffSessionExpiresAt?: string | null;
      }>(response, 'Action failed');
      const selectedStaffName = selectedStaff?.name ?? 'Staff member';
      const returnedExpiry = payload.verifiedStaffSessionExpiresAt ? new Date(payload.verifiedStaffSessionExpiresAt).getTime() : null;
      const nextExpiry = returnedExpiry && Number.isFinite(returnedExpiry) ? returnedExpiry : selectedStaffIsVerified ? activeVerifiedStaff?.expiresAt ?? null : null;
      if (nextExpiry && nextExpiry > Date.now()) {
        setVerifiedStaffSession({ staffId: selectedStaffId, staffName: selectedStaffName, expiresAt: nextExpiry });
        setVerificationNow(Date.now());
      }
      const updatedAppointmentCode = payload.appointment?.code ?? modal.appointmentId ?? 'this appointment';
      setBoardNotice(modal.action === 'ADD_SUPPORT' ? `${selectedStaffName} added as support to ${updatedAppointmentCode}.` : `${selectedStaffName} verified · Board updated.`);
      setModal(null);
      setSelectedStaffId('');
      setPin('');
      setReason('');
      setSkipReasonId('');
      await loadBoard();
      window.setTimeout(() => setBoardNotice(''), 4200);
    } catch (error) {
      setPin('');
      setNotice(getApiErrorMessage(error, 'Action failed'));
    } finally {
      actionSubmitInFlightRef.current = false;
      setLoading(false);
    }
  }

  function openAction(action: Action, appointmentId?: string, staffId?: string, appointmentServiceId?: string) {
    const staffOptions = action === 'ADD_SUPPORT' ? availableStaff : board.staff;
    actionSequenceRef.current += 1;
    setSelectedStaffId(staffId ?? staffOptions[0]?.id ?? '');
    setPin('');
    setReason('');
    setSkipReasonId(action === 'SKIP' ? board.skipReasons[0]?.id ?? '' : '');
    setModal({ action, appointmentId, appointmentServiceId, staffId, idempotencyKey: `${action.toLowerCase()}-${appointmentId ?? staffId ?? 'staff'}-${actionSequenceRef.current}` });
    setNotice('');
  }

  function handleBoardTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tab: BoardTab) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: BoardTab[] = ['turns', 'staff'];
    const currentIndex = tabs.indexOf(tab);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(nextTab + '-tab')?.focus());
  }

  return (
    <main className={`board-shell page-root board-sync-${syncStatus.toLowerCase()}`}>
      <header className="app-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Queue board</small></span>
        </Link>
        <div className="topbar-actions">
          {board.viewerRole === 'ADMIN' ? <Link className="button button-admin-nav" href="/admin"><span className="nav-action-icon"><ArrowLeft size={18} aria-hidden="true" /></span><span>Admin</span></Link> : null}
          {board.viewer ? <AccountMenu viewer={board.viewer} callbackUrl="/sign-in" /> : board.viewerRole ? <SignOutButton callbackUrl="/sign-in" className="button button-outline button-sm" /> : <SafariLoginLink className="button button-quiet button-sm" href="/sign-in"><LogIn size={16} aria-hidden="true" /> Log in</SafariLoginLink>}
        </div>
      </header>

      <div className="board-main">
        <div className="board-heading">
          <div>
            <div className="eyebrow">Salon floor</div>
            <h1>Today’s queue</h1>
            <p>View current appointments and the next guests in line. Sign in to manage queue actions.</p>
          </div>
          <div className="topbar-actions board-heading-actions">
            <span className={`board-last-updated board-sync-indicator board-sync-indicator-${syncStatus.toLowerCase()}`} role="status" aria-live="polite"><span className="board-sync-dot" aria-hidden="true" />{board.at ? `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: board.shop.timezone }).format(new Date(board.at))}` : 'Waiting for update'} · {syncStatus === 'POLLING' ? 'Syncing' : syncStatus === 'RECONNECTING' ? 'Reconnecting' : 'Stale'}</span>
            {activeVerifiedStaff ? <span className="board-staff-verification" role="status" aria-live="polite"><ShieldCheck size={15} aria-hidden="true" /> {activeVerifiedStaff.staffName} verified <span aria-hidden="true">· {formatVerificationRemaining(activeVerifiedStaff.expiresAt, verificationNow)}</span></span> : null}
            <button className="button button-outline button-sm" onClick={loadBoard}><RefreshCcw size={15} aria-hidden="true" /> Refresh</button>
          </div>
        </div>

        <div className="board-tabs" role="tablist" aria-label="Today’s queue views">
          <button type="button" role="tab" id="turns-tab" aria-controls="turns-panel" aria-selected={activeTab === 'turns'} tabIndex={activeTab === 'turns' ? 0 : -1} className={'board-tab ' + (activeTab === 'turns' ? 'active' : '')} onClick={() => setActiveTab('turns')} onKeyDown={(event) => handleBoardTabKeyDown(event, 'turns')}><span className="board-tab-icon"><ClipboardList size={19} aria-hidden="true" /></span><span className="board-tab-copy"><strong>Queue</strong><small>{currentServiceCount} in service · {board.upNext.length} up next</small></span></button>
          <button type="button" role="tab" id="staff-tab" aria-controls="staff-panel" aria-selected={activeTab === 'staff'} tabIndex={activeTab === 'staff' ? 0 : -1} className={'board-tab ' + (activeTab === 'staff' ? 'active' : '')} onClick={() => setActiveTab('staff')} onKeyDown={(event) => handleBoardTabKeyDown(event, 'staff')}><span className="board-tab-icon"><Users size={19} aria-hidden="true" /></span><span className="board-tab-copy"><strong>Staff attendance</strong><small>{board.staff.filter((member) => member.isPresent).length} of {board.staff.length} checked in</small></span></button>
        </div>

        {boardError ? <div className="management-error" role="alert">{boardError}<button className="button button-quiet button-sm" onClick={() => void loadBoard()}>Retry</button></div> : null}
        {!boardLoaded ? <div className="card management-loading" role="status">Loading the queue…</div> : activeTab === 'turns' ? <div className="board-grid" id="turns-panel" role="tabpanel" aria-labelledby="turns-tab">
          <section className={`card current-turn ${currentTurns.length ? 'has-turns' : 'is-empty'}`} aria-labelledby="current-turn-title">
            <div className="current-turn-heading"><div className="eyebrow" id="current-turn-title">In service</div><span className="status-badge status-blue">{currentServiceCount} in service</span></div>
            {currentTurns.length ? <div className="current-turn-list">{currentTurns.flatMap((appointment) => {
              const services = servicesForAppointment(appointment);
              const activeServices = services.filter((service) => service.status === 'IN_SERVICE');
              const visibleServices = activeServices.length ? activeServices : appointment.status === 'PAYMENT_PENDING' ? [services.find((service) => service.status !== 'COMPLETED') ?? services[services.length - 1]] : [];
              return visibleServices.filter(Boolean).map((service) => {
                const currentStaff = staffForService(service);
                const supportingStaff = (appointment.supportingStaffIds ?? []).map((staffId) => board.staff.find((member) => member.id === staffId)).filter((member): member is Staff => Boolean(member && member.id !== currentStaff?.id));
                const nextService = services.filter((candidate) => candidate.sequence > service.sequence && ['CREATED', 'WAITING', 'ASSIGNED'].includes(candidate.status)).sort((left, right) => left.sequence - right.sequence)[0];
                const canContinueWithCurrentStaff = Boolean(board.viewerRole && currentStaff && nextService && nextService.primaryStaffId !== currentStaff.id);
                return <article className={`current-turn-entry ${appointment.status === 'PAYMENT_PENDING' ? 'is-payment-pending' : 'is-in-service'}`} key={`${appointment.id}-${service.id}`}>
                  <div className="current-turn-detail">
                    <div className="current-turn-code-row">
                      <div>
                        <span className="current-turn-kicker">Turn</span>
                        <h2>{appointment.code}</h2>
                      </div>
                      <span className={`status-badge ${appointment.status === 'PAYMENT_PENDING' ? 'status-warning' : 'status-success'}`}>
                        {appointment.status === 'PAYMENT_PENDING' ? 'Awaiting payment' : 'In service'}
                      </span>
                    </div>
                    <div className="current-service"><span>{service.serviceName}</span><span aria-hidden="true"> · </span><span>{service.durationMin} min</span><span aria-hidden="true"> · </span><strong>{appointment.customerName}</strong></div>
                  </div>
                  <div className="current-footer">
                    <div className="current-staff">{currentStaff ? <InitialsAvatar initials={currentStaff.initials} /> : null}<div className="current-staff-copy"><small>Assigned specialist</small><strong>{currentStaff?.name ?? 'Waiting for staff'}</strong>{supportingStaff.length ? <span className="current-support-staff"><Users size={14} aria-hidden="true" /><span>Support: {supportingStaff.map((member) => member.name).join(', ')}</span></span> : null}</div></div>
                    {board.viewerRole && appointment.status !== 'PAYMENT_PENDING' ? <div className="topbar-actions current-turn-actions">
                      <button className="button button-outline button-sm current-turn-support-action" onClick={() => openAction('ADD_SUPPORT', appointment.id)} disabled={!availableStaff.length} title={!availableStaff.length ? 'No staff is currently available to support this service' : undefined}><Plus size={15} aria-hidden="true" /> Add support</button>{canContinueWithCurrentStaff ? <button className="button button-outline button-sm current-turn-continue-action" aria-label={`Continue ${nextService?.serviceName} with me`} onClick={() => openAction('CONTINUE_WITH_ME', appointment.id, currentStaff?.id, nextService?.id)}><ArrowRight size={15} aria-hidden="true" /> Continue with me</button> : null}<button className="button button-primary button-sm" onClick={() => openAction('FINISH', appointment.id, currentStaff?.id, service.id)}><Check size={15} aria-hidden="true" /> Finish service</button>
                    </div> : null}
                  </div>
                </article>;
              });
            })}</div> : <div className="empty-state current-empty-state"><span className="current-empty-icon"><Scissors size={26} aria-hidden="true" /></span><div><strong>No active service</strong><span>New appointments will appear here when a service starts.</span></div></div>}
          </section>

          <div className={`board-side ${board.upNext.length ? 'has-up-next' : 'is-empty'}`}>
            <section className="card card-pad">
              <div className="card-title-row"><div><h2 className="card-title">Up next</h2><p>Next in line, based on service and wait time.</p></div><span className="status-badge status-blue">{board.upNext.length} in queue</span></div>
              <div className="queue-list">
                {board.upNext.map((appointment) => {
                  const services = servicesForAppointment(appointment);
                  const assignedServices = services.filter((service) => service.status === 'ASSIGNED');
                  const highlightedService = assignedServices[0] ?? services.find((service) => service.status !== 'COMPLETED');
                  const assignedStaff = highlightedService ? staffForService(highlightedService) : null;
                  const needsManagerReview = Boolean(highlightedService && highlightedService.status === 'WAITING' && highlightedService.turnExclusions.length);
                  const expanded = Boolean(expandedQueueItems[appointment.id]);
                  const visibleServices = expanded || services.length <= 3 ? services : services.slice(0, 3);
                  const assignedStaffMembers = assignedServices.reduce<Array<{ id: string; name: string; initials: string }>>((members, service) => {
                    const member = staffForService(service);
                    if (member && !members.some((candidate) => candidate.id === member.id)) members.push(member);
                    return members;
                  }, []);
                  const supportStaffMembers = (appointment.supportingStaffIds ?? [])
                    .map((staffId) => board.staff.find((member) => member.id === staffId))
                    .filter((member): member is Staff => Boolean(member && !assignedStaffMembers.some((assignedMember) => assignedMember.id === member.id)));
                  const displayedStaffMembers = [...assignedStaffMembers, ...supportStaffMembers];
                  const showServiceStaff = displayedStaffMembers.length > 1;
                  const assigneeLabel = supportStaffMembers.length
                    ? `Assigned staff · ${supportStaffMembers.length} support`
                    : assignedStaffMembers.length > 1
                      ? `Assigned staff · ${assignedStaffMembers.length} specialists`
                      : assignedServices.length > 1
                        ? `Assigned staff · ${assignedServices.length} ready`
                        : 'Assigned staff';
                  const totalDuration = services.reduce((total, service) => total + service.durationMin, 0);
                  return <div className="queue-item" key={appointment.id}>
                    <div className="queue-number">{appointment.code}</div>
                    <div className="queue-item-body">
                      <strong>{appointment.customerName}</strong>
                      <div className="queue-service-list" id={`queue-services-${appointment.id}`} aria-label={`${services.length} services`}>
                        {visibleServices.map((service) => {
                          const serviceStatus = service.status === 'COMPLETED' ? 'Done' : service.status === 'IN_SERVICE' ? 'In service' : service.status === 'ASSIGNED' ? 'Next' : 'Queued';
                          const serviceClass = service.status === 'COMPLETED' ? 'is-completed' : service.status === 'ASSIGNED' ? 'is-next' : 'is-queued';
                          const serviceStaff = staffForService(service);
                          const showRowStaff = showServiceStaff && service.status === 'ASSIGNED';
                          return <div className={`queue-service-row ${serviceClass}${showRowStaff ? ' has-staff' : ''}`} key={service.id} aria-current={service.status === 'ASSIGNED' ? 'step' : undefined}>
                            <span className="queue-service-status">{serviceStatus}</span>
                            <span className="queue-service-name">{service.sequence}. {service.serviceName}</span>
                            {showRowStaff && serviceStaff ? <span className="queue-service-staff" aria-label={`Assigned to ${serviceStaff.name}`}><InitialsAvatar initials={serviceStaff.initials} tone="blue" /><span>{serviceStaff.name}</span></span> : null}
                          </div>;
                        })}
                        {services.length > 3 ? <button type="button" className="queue-service-toggle" aria-controls={`queue-services-${appointment.id}`} aria-expanded={expanded} onClick={() => toggleQueueServices(appointment.id)}>{expanded ? <>Show fewer services <ChevronUp size={15} aria-hidden="true" /></> : <>View all {services.length} services <ChevronDown size={15} aria-hidden="true" /></>}</button> : null}
                      </div>
                      <small className="queue-service-meta">{services.length} services · {totalDuration} min total</small>
                    </div>
                    {assignedStaff || supportStaffMembers.length ? <div className="queue-assignee" aria-label={`Assigned staff ${displayedStaffMembers.map((member) => member.name).join(', ')}`}>
                      <span className="queue-assignee-label">{assigneeLabel}</span>
                      {displayedStaffMembers.length > 1 ? <div className="queue-assignee-list">{displayedStaffMembers.map((member) => <span className="queue-assignee-member" key={member.id}><InitialsAvatar initials={member.initials} tone="blue" /><span>{member.name}</span></span>)}</div> : assignedStaff ? <span className="queue-assignee-name"><InitialsAvatar initials={assignedStaff.initials} tone="blue" /><span className="queue-assignee-name-text">{assignedStaff.name}</span></span> : null}
                    </div> : <span className={`status-badge ${needsManagerReview ? 'status-warning' : 'status-neutral'} queue-status`} title={needsManagerReview ? 'All currently eligible staff are excluded for this exact service. A manager can review the exclusion.' : undefined}>{needsManagerReview ? 'Manager review' : 'Waiting'}</span>}
                    {board.viewerRole && assignedServices.length ? <div className="queue-actions" aria-label="Service actions">{assignedServices.map((service) => { const serviceStaff = staffForService(service); return <div className="queue-service-action" key={service.id} role="group" aria-label={`Actions for ${service.serviceName}`}><span className="queue-service-action-label"><small>Next service</small><strong>{service.serviceName}</strong></span><button className="button button-primary button-sm queue-action" aria-label={`Accept ${service.serviceName}`} onClick={() => openAction('ACCEPT', appointment.id, serviceStaff?.id, service.id)}><Check size={15} aria-hidden="true" /> Accept</button><button className="button button-outline button-sm queue-action queue-skip-action" aria-label={`Skip ${service.serviceName}`} onClick={() => openAction('SKIP', appointment.id, serviceStaff?.id, service.id)}><MessageSquareWarning size={15} aria-hidden="true" /> Skip</button></div>; })}</div> : null}
                  </div>;
                })}
                {!board.upNext.length ? <div className="empty-state queue-empty-state"><span className="queue-empty-icon"><Clock3 size={22} aria-hidden="true" /></span><div><strong>Queue is clear</strong><span>New check-ins will appear here.</span></div></div> : null}
              </div>
            </section>

            <StaffAvailabilityRail staff={board.staff} />

          </div>
        </div> : <div id="staff-panel" role="tabpanel" aria-labelledby="staff-tab"><StaffAttendancePanel staff={board.staff} viewerRole={board.viewerRole} onAction={(action, staffId) => openAction(action, undefined, staffId)} /></div>}
      </div>

      {modal ? <div className="modal-backdrop" role="presentation"><div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="verify-title">
        <div className="modal-header"><div><div className="eyebrow">Staff PIN verification</div><h2 id="verify-title">{modal.action === 'CONTINUE_WITH_ME' ? 'Continue with this specialist?' : `Verify ${verificationActionLabel}`}</h2><p>{selectedStaff ? `Confirm this action for ${selectedStaff.name}.` : 'Choose a staff member, then enter their PIN.'}</p></div><button type="button" className="modal-close" aria-label="Close dialog" onClick={closeActionModal}><X size={18} aria-hidden="true" /></button></div>
        <form className="form-grid" onSubmit={submitAction}>
          {!staffSelectionLocked ? <div className="field"><label htmlFor="staff-name">Select staff</label><select id="staff-name" value={selectedStaffIsValid ? selectedStaffId : ''} onChange={(event) => { setSelectedStaffId(event.target.value); setPin(''); }} required disabled={!modalStaff.length}>{modalStaff.length ? modalStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>) : <option value="">No staff currently available</option>}</select><span className="field-hint">Select the specialist completing this action.</span></div> : null}
          <div className="staff-verification-card" aria-live="polite"><div className="staff-verification-card-heading"><span className="staff-verification-icon"><ShieldCheck size={20} aria-hidden="true" /></span><div><span>Verifying for</span><strong>{selectedStaff?.name ?? 'Select a staff member'}</strong></div>{selectedStaffIsVerified ? <span className="status-badge status-success">PIN active</span> : null}</div>{selectedStaff ? <div className="staff-verification-meta"><span>{selectedStaff.isPresent ? 'Checked in today' : 'Not checked in today'}</span><span>{selectedStaff.availability === 'BUSY' ? 'Busy with a guest' : 'Available'}</span></div> : null}</div>
          <PinKeypad
            value={pin}
            onChange={(nextPin) => { setPin(nextPin); if (notice) setNotice(''); }}
            onComplete={(completedPin) => { void submitAction(undefined, completedPin); }}
            maxLength={4}
            autoSubmit
            label={selectedStaff ? `${selectedStaff.name}’s 4-digit PIN` : 'Staff 4-digit PIN'}
            hint={selectedStaffIsVerified ? `${selectedStaff?.name} is already verified for ${formatVerificationRemaining(activeVerifiedStaff?.expiresAt ?? verificationNow, verificationNow)}. You can confirm without entering the PIN again.` : selectedStaff ? `Enter ${selectedStaff.name}’s PIN. All 4 digits submit automatically.` : 'Choose a staff member before entering a PIN.'}
            error={notice}
            disabled={loading || !selectedStaffIsValid}
          />
          {modal.action === 'SKIP' ? <div className="field"><label htmlFor="skip-reason">Reason for skip</label><select id="skip-reason" value={skipReasonId} onChange={(event) => setSkipReasonId(event.target.value)} required><option value="" disabled>Select a reason</option>{board.skipReasons.map((skipReason) => <option value={skipReason.id} key={skipReason.id}>{skipReason.name}</option>)}</select><span className="field-hint">This exclusion stays attached to this service until a manager explicitly overrides it.</span></div> : null}
          <div className="form-actions"><button className="button button-quiet" type="button" onClick={closeActionModal}>Cancel</button><button className="button button-primary" disabled={loading || !selectedStaffIsValid || !pinCanSubmit}>{loading ? 'Saving…' : <><UserCheck size={16} aria-hidden="true" /> {modal.action === 'CONTINUE_WITH_ME' ? selectedStaffIsVerified ? `Continue as ${selectedStaff?.name ?? 'staff'}` : 'Verify & continue' : selectedStaffIsVerified ? `Confirm for ${selectedStaff?.name ?? 'staff'}` : 'Verify & confirm'}</>}</button></div>
        </form>
      </div></div> : null}
      {boardNotice ? <div className="toast" role="status" aria-live="polite"><Check size={17} aria-hidden="true" />{boardNotice}</div> : null}
    </main>
  );
}
