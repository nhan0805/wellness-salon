'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, ClipboardList, Clock3, LogIn, LogOut, MessageSquareWarning, Plus, RefreshCcw, Scissors, Search, Sparkles, UserCheck, Users, X } from 'lucide-react';
import { InitialsAvatar } from '@/src/components/ui';
import { SignOutButton } from '@/src/components/sign-out-button';
import { useDialogFocus } from '@/src/components/use-dialog-focus';

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
};
type Appointment = { id: string; code: string; customerName: string; serviceName: string; durationMin: number; amount: number; status: string; primaryStaffId: string | null; createdAt: string; supportingStaffIds: string[]; turns: Array<{ status: string; reason: string | null; skipReasonNameSnapshot?: string | null }>; services: AppointmentService[] };
type BoardState = { current: Appointment | null; currentTurns: Appointment[]; upNext: Appointment[]; staff: Staff[]; skipReasons: Array<{ id: string; name: string }>; shop: { timezone: string; openingTime: string; closingTime: string; currency: string }; version: number; at: string; viewerRole: 'ADMIN' | 'STATION' | null };
type Action = 'ACCEPT' | 'SKIP' | 'FINISH' | 'CHECK_IN' | 'CHECK_OUT' | 'ADD_SUPPORT' | 'CONTINUE_WITH_ME';
type BoardTab = 'turns' | 'staff';
type AttendanceAction = Extract<Action, 'CHECK_IN' | 'CHECK_OUT'>;
type SyncStatus = 'LIVE' | 'POLLING' | 'RECONNECTING' | 'STALE';

const emptyBoard: BoardState = { current: null, currentTurns: [], upNext: [], staff: [], skipReasons: [], shop: { timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', currency: 'USD' }, version: 0, at: '', viewerRole: null };

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
    {!viewerRole ? <div className="staff-attendance-login" role="note"><Users size={20} aria-hidden="true" /><div><strong>Staff actions are protected</strong><span>Sign in to manage attendance and verify each action with a staff PIN.</span></div><Link className="button button-secondary button-sm" href="/sign-in"><LogIn size={15} aria-hidden="true" /> Log in</Link></div> : null}
    {staff.length ? filteredStaff.length ? <div className="staff-attendance-grid">{staffCards}</div> : <div className="empty-state staff-search-empty"><Search size={27} aria-hidden="true" /><div><strong>No staff found</strong><span>Try another name or clear your search.</span><button type="button" className="button button-quiet button-sm" onClick={clearSearch}>Clear search</button></div></div> : <div className="empty-state"><Users size={28} aria-hidden="true" /><span>No active staff records.</span></div>}
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
  const actionSequenceRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const latestVersionRef = useRef(0);
  const lastSuccessAtRef = useRef<number>(0);

  const availableStaff = board.staff.filter((member) => member.isPresent && member.availability === 'AVAILABLE');
  const modalStaff = modal?.action === 'ADD_SUPPORT' ? availableStaff : board.staff;
  const selectedStaffIsValid = modalStaff.some((member) => member.id === selectedStaffId);

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
    const requestSequence = ++requestSequenceRef.current;
    requestControllerRef.current?.abort();
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    requestControllerRef.current = controller;
    setSyncStatus((current) => current === 'LIVE' ? current : 'POLLING');
    let timedOut = false;
    let timeoutId: number | undefined;
    try {
      const request = fetch('/api/board', { cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true;
          controller?.abort();
          reject(new Error('The live queue is taking too long to load.'));
        }, 12_000);
      });
      const response = await Promise.race([request, timeout]);
      if (!response.ok) throw new Error('Unable to load the live board');
      const nextBoard = await response.json() as BoardState;
      if (requestSequence !== requestSequenceRef.current) return;
      if (nextBoard.version < latestVersionRef.current) return;
      latestVersionRef.current = nextBoard.version;
      setBoard(nextBoard);
      setBoardLoaded(true);
      setBoardError('');
      lastSuccessAtRef.current = Date.now();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (requestSequence !== requestSequenceRef.current) return;
      setBoardError(timedOut ? 'The live queue is taking too long to load. Check the tablet connection and try again.' : error instanceof Error ? error.message : 'Unable to load the live board');
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
    const connect = () => {
      if (disposed) return;
      source?.close();
      source = new EventSource('/api/sse/board');
      source.onopen = () => { reconnectAttempt = 0; setSyncStatus('LIVE'); };
      source.onmessage = () => { void loadBoard(); };
      source.onerror = () => {
        source?.close();
        source = null;
        setSyncStatus('RECONNECTING');
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt, 5))));
      };
    };
    const initialLoad = window.setTimeout(() => { void loadBoard(); }, 0);
    connect();
    const poll = window.setInterval(() => { void loadBoard(); }, 5_000);
    const staleCheck = window.setInterval(() => {
      if (lastSuccessAtRef.current && Date.now() - lastSuccessAtRef.current > 15_000) setSyncStatus('STALE');
    }, 5_000);
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
      window.clearInterval(staleCheck);
      requestControllerRef.current?.abort();
    };
  }, [loadBoard]);

  const currentTurns = board.currentTurns.length ? board.currentTurns : board.current ? [board.current] : [];
  const currentServiceCount = currentTurns.reduce((count, appointment) => {
    const activeCount = servicesForAppointment(appointment).filter((service) => service.status === 'IN_SERVICE').length;
    return count + (activeCount || appointment.status === 'PAYMENT_PENDING' ? 1 : 0);
  }, 0);

  function servicesForAppointment(appointment: Appointment) {
    return appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, sequence: 1, serviceName: appointment.serviceName, durationMin: appointment.durationMin, status: appointment.status, primaryStaffId: appointment.primaryStaffId, primaryStaff: null, turns: appointment.turns }];
  }

  function staffForService(service: AppointmentService): { id: string; name: string; initials: string } | null {
    return service.primaryStaff ?? (service.primaryStaffId ? board.staff.find((member) => member.id === service.primaryStaffId) ?? null : null);
  }

  function toggleQueueServices(appointmentId: string) {
    setExpandedQueueItems((current) => ({ ...current, [appointmentId]: !current[appointmentId] }));
  }

  async function submitAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
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
          pin: pin || undefined,
          reason: reason || undefined,
          skipReasonId: modal.action === 'SKIP' ? skipReasonId : undefined,
          idempotencyKey: modal.idempotencyKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Action failed');
      const selectedStaffName = modalStaff.find((member) => member.id === selectedStaffId)?.name ?? 'Staff member';
      const updatedAppointmentCode = payload.appointment?.code ?? modal.appointmentId ?? 'this appointment';
      setBoardNotice(modal.action === 'ADD_SUPPORT' ? `${selectedStaffName} added as support to ${updatedAppointmentCode}.` : 'Board updated.');
      setModal(null);
      setSelectedStaffId('');
      setPin('');
      setReason('');
      setSkipReasonId('');
      await loadBoard();
      window.setTimeout(() => setBoardNotice(''), 4200);
    } catch (error) {
      setPin('');
      setNotice(error instanceof Error ? error.message : 'Action failed');
    } finally {
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

  return (
    <main className="board-shell page-root">
      <header className="app-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Queue board</small></span>
        </Link>
        <div className="topbar-actions">
          {board.viewerRole === 'ADMIN' ? <Link className="button button-admin-nav" href="/admin"><span className="nav-action-icon"><ArrowLeft size={18} aria-hidden="true" /></span><span>Back to Admin</span></Link> : null}
          {board.viewerRole ? <SignOutButton callbackUrl="/sign-in" className="button button-outline button-sm" /> : <Link className="button button-quiet button-sm" href="/sign-in"><LogIn size={16} aria-hidden="true" /> Log in</Link>}
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
            <span className="board-last-updated" role="status" aria-live="polite">{board.at ? `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: board.shop.timezone }).format(new Date(board.at))}` : 'Waiting for update'} · {syncStatus === 'LIVE' ? 'Live' : syncStatus === 'POLLING' ? 'Checking' : syncStatus === 'RECONNECTING' ? 'Reconnecting' : 'Stale'}</span>
            <button className="button button-outline button-sm" onClick={loadBoard}><RefreshCcw size={15} aria-hidden="true" /> Refresh</button>
          </div>
        </div>

        <div className="board-tabs" role="tablist" aria-label="Today’s queue views">
          <button type="button" role="tab" id="turns-tab" aria-controls="turns-panel" aria-selected={activeTab === 'turns'} className={'board-tab ' + (activeTab === 'turns' ? 'active' : '')} onClick={() => setActiveTab('turns')}><span className="board-tab-icon"><ClipboardList size={19} aria-hidden="true" /></span><span className="board-tab-copy"><strong>Queue</strong><small>{currentServiceCount} in service · {board.upNext.length} up next</small></span></button>
          <button type="button" role="tab" id="staff-tab" aria-controls="staff-panel" aria-selected={activeTab === 'staff'} className={'board-tab ' + (activeTab === 'staff' ? 'active' : '')} onClick={() => setActiveTab('staff')}><span className="board-tab-icon"><Users size={19} aria-hidden="true" /></span><span className="board-tab-copy"><strong>Staff attendance</strong><small>{board.staff.filter((member) => member.isPresent).length} of {board.staff.length} checked in</small></span></button>
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
                    </div> : <span className="status-badge status-neutral queue-status">Waiting</span>}
                    {board.viewerRole && assignedServices.length ? <div className="queue-actions" aria-label="Service actions">{assignedServices.map((service) => { const serviceStaff = staffForService(service); return <div className="queue-service-action" key={service.id} role="group" aria-label={`Actions for ${service.serviceName}`}><span className="queue-service-action-label"><small>Next service</small><strong>{service.serviceName}</strong></span><button className="button button-primary button-sm queue-action" aria-label={`Accept ${service.serviceName}`} onClick={() => openAction('ACCEPT', appointment.id, serviceStaff?.id, service.id)}><Check size={15} aria-hidden="true" /> Accept</button><button className="button button-outline button-sm queue-action queue-skip-action" aria-label={`Skip ${service.serviceName}`} onClick={() => openAction('SKIP', appointment.id, serviceStaff?.id, service.id)}><MessageSquareWarning size={15} aria-hidden="true" /> Skip</button></div>; })}</div> : null}
                  </div>;
                })}
                {!board.upNext.length ? <div className="empty-state queue-empty-state"><span className="queue-empty-icon"><Clock3 size={22} aria-hidden="true" /></span><div><strong>Queue is clear</strong><span>New check-ins will appear here.</span></div></div> : null}
              </div>
            </section>

          </div>
        </div> : <div id="staff-panel" role="tabpanel" aria-labelledby="staff-tab"><StaffAttendancePanel staff={board.staff} viewerRole={board.viewerRole} onAction={(action, staffId) => openAction(action, undefined, staffId)} /></div>}
      </div>

      {modal ? <div className="modal-backdrop" role="presentation"><div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="verify-title">
        <div className="modal-header"><div><h2 id="verify-title">{modal.action === 'CONTINUE_WITH_ME' ? 'Continue with this specialist?' : 'Verify this action'}</h2><p>{modal.action === 'CONTINUE_WITH_ME' ? 'The next service will move to the specialist currently serving this guest. The current assignment will be released.' : 'Select a staff member and enter the 4-digit PIN to confirm this action.'}</p></div><button type="button" className="modal-close" aria-label="Close dialog" onClick={closeActionModal}><X size={18} aria-hidden="true" /></button></div>
        <form className="form-grid" onSubmit={submitAction}>
          <div className="field"><label htmlFor="staff-name">Select staff</label><select id="staff-name" value={selectedStaffIsValid ? selectedStaffId : ''} onChange={(event) => { setSelectedStaffId(event.target.value); setPin(''); }} required disabled={!modalStaff.length || ['ACCEPT', 'SKIP', 'FINISH', 'CONTINUE_WITH_ME'].includes(modal.action)}>{modalStaff.length ? modalStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>) : <option value="">No staff currently available</option>}</select><span className="field-hint">{['ACCEPT', 'SKIP', 'FINISH'].includes(modal.action) ? 'This appointment is already assigned to the selected specialist.' : modal.action === 'CONTINUE_WITH_ME' ? 'Only the specialist currently serving this guest can continue the next service.' : 'Select the specialist completing this action.'}</span></div>
          <div className="field"><label htmlFor="staff-pin">4-digit PIN</label><input id="staff-pin" name="verification-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" autoFocus placeholder="••••" /><span className="field-hint">Enter the staff PIN. Your verification stays active for the configured session.</span></div>
          {modal.action === 'SKIP' ? <div className="field"><label htmlFor="skip-reason">Reason for skip</label><select id="skip-reason" value={skipReasonId} onChange={(event) => setSkipReasonId(event.target.value)} required><option value="" disabled>Select a reason</option>{board.skipReasons.map((skipReason) => <option value={skipReason.id} key={skipReason.id}>{skipReason.name}</option>)}</select><span className="field-hint">This exclusion stays attached to this service until a manager explicitly overrides it.</span></div> : null}
          {notice ? <p role="alert" className="subtle" style={{ color: 'var(--color-danger)' }}>{notice}</p> : null}
          <div className="form-actions"><button className="button button-quiet" type="button" onClick={closeActionModal}>Cancel</button><button className="button button-primary" disabled={loading || !selectedStaffIsValid || (pin.length > 0 && pin.length !== 4)}>{loading ? 'Saving…' : <><UserCheck size={16} aria-hidden="true" /> {modal.action === 'CONTINUE_WITH_ME' ? 'Continue with me' : 'Confirm action'}</>}</button></div>
        </form>
      </div></div> : null}
      {boardNotice ? <div className="toast" role="status" aria-live="polite"><Check size={17} aria-hidden="true" />{boardNotice}</div> : null}
    </main>
  );
}
