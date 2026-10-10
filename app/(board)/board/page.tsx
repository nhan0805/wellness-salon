'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ClipboardList, Clock3, LogIn, LogOut, MessageSquareWarning, Plus, RefreshCcw, Scissors, Sparkles, UserCheck, Users, X } from 'lucide-react';
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
type Appointment = { id: string; code: string; customerName: string; serviceName: string; durationMin: number; amount: number; status: string; primaryStaffId: string | null; createdAt: string; turns: Array<{ status: string; reason: string | null; skipReasonNameSnapshot?: string | null }>; services: AppointmentService[] };
type BoardState = { current: Appointment | null; currentTurns: Appointment[]; upNext: Appointment[]; staff: Staff[]; skipReasons: Array<{ id: string; name: string }>; shop: { timezone: string; openingTime: string; closingTime: string; currency: string }; version: number; at: string; viewerRole: 'ADMIN' | 'STATION' | null };
type Action = 'ACCEPT' | 'SKIP' | 'FINISH' | 'CHECK_IN' | 'CHECK_OUT' | 'ADD_SUPPORT';
type BoardTab = 'turns' | 'staff';
type AttendanceAction = Extract<Action, 'CHECK_IN' | 'CHECK_OUT'>;
type SyncStatus = 'LIVE' | 'POLLING' | 'RECONNECTING' | 'STALE';

const emptyBoard: BoardState = { current: null, currentTurns: [], upNext: [], staff: [], skipReasons: [], shop: { timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', currency: 'USD' }, version: 0, at: '', viewerRole: null };

function StaffAttendancePanel({ staff, viewerRole, onAction }: { staff: Staff[]; viewerRole: BoardState['viewerRole']; onAction: (action: AttendanceAction, staffId: string) => void }) {
  const presentCount = staff.filter((member) => member.isPresent).length;
  const availableCount = staff.filter((member) => member.isPresent && member.availability === 'AVAILABLE').length;

  return <section className="card card-pad staff-attendance-panel" aria-labelledby="staff-attendance-title">
    <div className="card-title-row"><div><h2 className="card-title" id="staff-attendance-title">Staff attendance</h2><p>Check specialists in for the day or check them out when their work is complete.</p></div><div className="staff-attendance-summary"><span className="status-badge status-success">{presentCount} present</span><span className="status-badge status-blue">{availableCount} available</span></div></div>
    {!viewerRole ? <div className="staff-attendance-login" role="note"><Users size={20} aria-hidden="true" /><div><strong>Staff actions are protected</strong><span>Sign in to manage attendance and verify each action with a staff PIN.</span></div><Link className="button button-secondary button-sm" href="/sign-in"><LogIn size={15} aria-hidden="true" /> Log in</Link></div> : null}
    {staff.length ? <div className="staff-attendance-grid">{staff.map((member) => <article className="staff-attendance-card" key={member.id}><div className="staff-attendance-identity"><InitialsAvatar initials={member.initials} tone={member.availability === 'BUSY' ? 'orange' : 'teal'} /><div className="staff-row-body"><strong>{member.name}</strong><small>{member.isPresent ? member.availability === 'BUSY' ? 'Serving a guest' : 'Ready for the next turn' : 'Not checked in today'}</small></div><span className={'status-badge ' + (member.isPresent ? member.availability === 'BUSY' ? 'status-warning' : 'status-success' : 'status-neutral')}>{member.isPresent ? member.availability === 'BUSY' ? 'Busy' : 'Available' : 'Away'}</span></div>{viewerRole ? <button type="button" className={'button ' + (member.isPresent ? 'button-primary' : 'button-secondary') + ' staff-attendance-action'} onClick={() => onAction(member.isPresent ? 'CHECK_OUT' : 'CHECK_IN', member.id)}>{member.isPresent ? <LogOut size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}{member.isPresent ? 'Check out' : 'Check in'}</button> : null}</article>)}</div> : <div className="empty-state"><Users size={28} aria-hidden="true" /><span>No active staff records.</span></div>}
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
  const [loading, setLoading] = useState(false);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [boardError, setBoardError] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('POLLING');
  const [activeTab, setActiveTab] = useState<BoardTab>('turns');
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
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setSyncStatus((current) => current === 'LIVE' ? current : 'POLLING');
    try {
      const response = await fetch('/api/board', { cache: 'no-store', signal: controller.signal });
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
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestSequence !== requestSequenceRef.current) return;
      setBoardError(error instanceof Error ? error.message : 'Unable to load the live board');
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

  function staffForService(service: AppointmentService) {
    return service.primaryStaff ?? (service.primaryStaffId ? board.staff.find((member) => member.id === service.primaryStaffId) ?? null : null);
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
      setNotice('Board updated.');
      setModal(null);
      setSelectedStaffId('');
      setPin('');
      setReason('');
      setSkipReasonId('');
      await loadBoard();
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
          <span className="brand-copy">Wellness Salon <small>Turn board</small></span>
        </Link>
        <div className="topbar-actions">
          {board.viewerRole === 'ADMIN' ? <Link className="button button-admin-nav" href="/admin"><span className="nav-action-icon"><ArrowLeft size={18} aria-hidden="true" /></span><span>Back to Admin</span></Link> : null}
          {board.viewerRole ? <SignOutButton callbackUrl="/sign-in" className="button button-outline button-sm" /> : <Link className="button button-quiet button-sm" href="/sign-in"><LogIn size={16} aria-hidden="true" /> Log in</Link>}
        </div>
      </header>

      <div className="board-main">
        <div className="board-heading">
          <div>
            <div className="eyebrow">Station 01 · Front floor</div>
            <h1>Today’s turn board</h1>
            <p>Everyone can view the same queue. Staff actions require a signed-in station and a short PIN session.</p>
          </div>
          <div className="topbar-actions board-heading-actions">
            <span className="board-last-updated" role="status" aria-live="polite">{board.at ? `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: board.shop.timezone }).format(new Date(board.at))}` : 'Waiting for update'} · {syncStatus === 'LIVE' ? 'Live' : syncStatus === 'POLLING' ? 'Checking' : syncStatus === 'RECONNECTING' ? 'Reconnecting' : 'Stale'}</span>
            <button className="button button-outline button-sm" onClick={loadBoard}><RefreshCcw size={15} aria-hidden="true" /> Refresh</button>
          </div>
        </div>

        <div className="board-tabs" role="tablist" aria-label="Today’s turn board views">
          <button type="button" role="tab" id="turns-tab" aria-controls="turns-panel" aria-selected={activeTab === 'turns'} className={'board-tab ' + (activeTab === 'turns' ? 'active' : '')} onClick={() => setActiveTab('turns')}><span className="board-tab-icon"><ClipboardList size={19} aria-hidden="true" /></span><span className="board-tab-copy"><strong>Turn board</strong><small>{currentServiceCount} in service · {board.upNext.length} up next</small></span></button>
          <button type="button" role="tab" id="staff-tab" aria-controls="staff-panel" aria-selected={activeTab === 'staff'} className={'board-tab ' + (activeTab === 'staff' ? 'active' : '')} onClick={() => setActiveTab('staff')}><span className="board-tab-icon"><Users size={19} aria-hidden="true" /></span><span className="board-tab-copy"><strong>Staff attendance</strong><small>{board.staff.filter((member) => member.isPresent).length} of {board.staff.length} checked in</small></span></button>
        </div>

        {boardError ? <div className="management-error" role="alert">{boardError}<button className="button button-quiet button-sm" onClick={() => void loadBoard()}>Retry</button></div> : null}
        {!boardLoaded ? <div className="card management-loading" role="status">Loading the live board from the database…</div> : activeTab === 'turns' ? <div className="board-grid" id="turns-panel" role="tabpanel" aria-labelledby="turns-tab">
          <section className="card current-turn" aria-labelledby="current-turn-title">
            <div className="current-turn-heading"><div className="eyebrow" id="current-turn-title">Current turns</div><span className="status-badge status-blue">{currentServiceCount} in service</span></div>
            {currentTurns.length ? <div className="current-turn-list">{currentTurns.flatMap((appointment) => {
              const services = servicesForAppointment(appointment);
              const activeServices = services.filter((service) => service.status === 'IN_SERVICE');
              const visibleServices = activeServices.length ? activeServices : appointment.status === 'PAYMENT_PENDING' ? [services.find((service) => service.status !== 'COMPLETED') ?? services[services.length - 1]] : [];
              return visibleServices.filter(Boolean).map((service) => {
                const currentStaff = staffForService(service);
                return <article className="current-turn-entry" key={`${appointment.id}-${service.id}`}>
                  <div className="current-turn-detail"><h2>{appointment.code}</h2><div className="current-service">{service.serviceName} · {service.durationMin} min · {appointment.customerName}</div></div>
                    <div className="current-footer">
                    <div className="current-staff">{currentStaff ? <InitialsAvatar initials={currentStaff.initials} /> : null}<div><small>Assigned specialist</small><strong>{currentStaff?.name ?? 'Waiting for staff'}</strong></div></div>
                    {board.viewerRole ? <div className="topbar-actions">
                      {appointment.status === 'PAYMENT_PENDING' ? <span className="status-badge status-warning">Awaiting admin payment</span> : <><button className="button button-outline button-sm current-turn-support-action" onClick={() => openAction('ADD_SUPPORT', appointment.id)} disabled={!availableStaff.length} title={!availableStaff.length ? 'No staff is currently available to support this service' : undefined}><Plus size={15} aria-hidden="true" /> Add support</button><button className="button button-primary button-sm" onClick={() => openAction('FINISH', appointment.id, currentStaff?.id, service.id)}><Check size={15} aria-hidden="true" /> Finish service</button></>}
                    </div> : null}
                  </div>
                </article>;
              });
            })}</div> : <div className="empty-state" style={{ color: 'var(--color-on-dark-muted)' }}><Scissors size={28} aria-hidden="true" /><span>No turn in service</span></div>}
          </section>

          <div className="board-side">
            <section className="card card-pad">
              <div className="card-title-row"><div><h2 className="card-title">Up next</h2><p>Routed by skill and fair wait time.</p></div><span className="status-badge status-blue">{board.upNext.length} in queue</span></div>
              <div className="queue-list">
                {board.upNext.map((appointment) => {
                  const services = servicesForAppointment(appointment);
                  const assignedServices = services.filter((service) => service.status === 'ASSIGNED');
                  const highlightedService = assignedServices[0] ?? services.find((service) => service.status !== 'COMPLETED');
                  const assignedStaff = highlightedService ? staffForService(highlightedService) : null;
                  const totalDuration = services.reduce((total, service) => total + service.durationMin, 0);
                  return <div className="queue-item" key={appointment.id}><div className="queue-number">{appointment.code}</div><div className="queue-item-body"><strong>{appointment.customerName}</strong><div className="queue-service-list" aria-label={`${services.length} services`}>
                    {services.map((service) => {
                      const serviceStatus = service.status === 'COMPLETED' ? 'Done' : service.status === 'IN_SERVICE' ? 'In service' : service.status === 'ASSIGNED' ? 'Next' : 'Queued';
                      const serviceClass = service.status === 'COMPLETED' ? 'is-completed' : service.status === 'ASSIGNED' ? 'is-next' : 'is-queued';
                      return <div className={`queue-service-row ${serviceClass}`} key={service.id} aria-current={service.status === 'ASSIGNED' ? 'step' : undefined}><span className="queue-service-name">{service.sequence}. {service.serviceName}</span><span className="queue-service-status">{serviceStatus}</span></div>;
                    })}
                  </div><small className="queue-service-meta">{services.length} services · {totalDuration} min total</small></div>{assignedStaff ? <div className="queue-assignee" aria-label={`Assigned staff ${assignedStaff.name}`}><span className="queue-assignee-label">Assigned staff{assignedServices.length > 1 ? ` · ${assignedServices.length} ready` : ''}</span><span className="queue-assignee-name"><InitialsAvatar initials={assignedStaff.initials} tone="blue" /><span className="queue-assignee-name-text">{assignedStaff.name}</span></span></div> : <span className="status-badge status-neutral queue-status">Waiting</span>}{board.viewerRole && assignedServices.length ? <div className="queue-actions" aria-label="Service actions">{assignedServices.map((service) => { const serviceStaff = staffForService(service); return <div className="queue-service-action" key={service.id} role="group" aria-label={`Actions for ${service.serviceName}`}><span className="queue-service-action-label"><small>Next service</small><strong>{service.serviceName}</strong></span><button className="button button-primary button-sm queue-action" aria-label={`Accept ${service.serviceName}`} onClick={() => openAction('ACCEPT', appointment.id, serviceStaff?.id, service.id)}><Check size={15} aria-hidden="true" /> Accept</button><button className="button button-outline button-sm queue-action queue-skip-action" aria-label={`Skip ${service.serviceName}`} onClick={() => openAction('SKIP', appointment.id, serviceStaff?.id, service.id)}><MessageSquareWarning size={15} aria-hidden="true" /> Skip</button></div>; })}</div> : null}</div>;
                })}
                {!board.upNext.length ? <div className="empty-state"><Clock3 size={22} aria-hidden="true" /><span>The queue is clear.</span></div> : null}
              </div>
            </section>

          </div>
        </div> : <div id="staff-panel" role="tabpanel" aria-labelledby="staff-tab"><StaffAttendancePanel staff={board.staff} viewerRole={board.viewerRole} onAction={(action, staffId) => openAction(action, undefined, staffId)} /></div>}
      </div>

      {modal ? <div className="modal-backdrop" role="presentation"><div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="verify-title">
        <div className="modal-header"><div><h2 id="verify-title">Verify this action</h2><p>Select a staff member and enter your 4-digit PIN. The verified session lasts 3 minutes.</p></div><button type="button" className="modal-close" aria-label="Close dialog" onClick={closeActionModal}><X size={18} aria-hidden="true" /></button></div>
        <form className="form-grid" onSubmit={submitAction}>
          <div className="field"><label htmlFor="staff-name">Select staff</label><select id="staff-name" value={selectedStaffIsValid ? selectedStaffId : ''} onChange={(event) => { setSelectedStaffId(event.target.value); setPin(''); }} required disabled={!modalStaff.length || ['ACCEPT', 'SKIP', 'FINISH'].includes(modal.action)}>{modalStaff.length ? modalStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>) : <option value="">No staff currently available</option>}</select><span className="field-hint">{['ACCEPT', 'SKIP', 'FINISH'].includes(modal.action) ? 'This turn is already assigned to the selected specialist.' : 'Select the specialist completing this action.'}</span></div>
          <div className="field"><label htmlFor="staff-pin">4-digit PIN</label><input id="staff-pin" name="verification-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" autoFocus placeholder="••••" /><span className="field-hint">Use the numeric keypad on iPad. Enter it once; the verified staff session lasts 3 minutes.</span></div>
          {modal.action === 'SKIP' ? <div className="field"><label htmlFor="skip-reason">Reason for skip</label><select id="skip-reason" value={skipReasonId} onChange={(event) => setSkipReasonId(event.target.value)} required><option value="" disabled>Select a reason</option>{board.skipReasons.map((skipReason) => <option value={skipReason.id} key={skipReason.id}>{skipReason.name}</option>)}</select><span className="field-hint">This exclusion stays attached to this service until a manager explicitly overrides it.</span></div> : null}
          {notice ? <p role="alert" className="subtle" style={{ color: 'var(--color-danger)' }}>{notice}</p> : null}
          <div className="form-actions"><button className="button button-quiet" type="button" onClick={closeActionModal}>Cancel</button><button className="button button-primary" disabled={loading || !selectedStaffIsValid || (pin.length > 0 && pin.length !== 4)}>{loading ? 'Saving…' : <><UserCheck size={16} aria-hidden="true" /> Confirm action</>}</button></div>
        </form>
      </div></div> : null}
    </main>
  );
}
