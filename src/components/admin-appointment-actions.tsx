'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { useDialogFocus } from '@/src/components/use-dialog-focus';

type ServiceRow = { id: string; serviceId: string; sequence: number; serviceName: string; durationMin: number; amount: number; status: string; primaryStaff: { id: string; name: string; initials: string } | null; turnExclusions: Array<{ staffId: string; staffName: string; reason: string; createdAt: string }> };
type Appointment = { id: string; code: string; customerName: string; status: string; serviceId: string; serviceName: string; amount: number; primaryStaff: { id: string; name: string; initials: string } | null; services: ServiceRow[] };
type CatalogService = { id: string; name: string; durationMin: number; price: number; requiredSkillIds: string[] };
type Staff = { id: string; name: string; isActive: boolean; status: string; availability: string };
type Mode = 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION';

export function AdminAppointmentAction({ appointment, mode, currency, onClose, onComplete }: { appointment: Appointment; mode: Mode; currency: string; onClose: () => void; onComplete: (message: string) => void }) {
  const [serviceId, setServiceId] = useState(appointment.services.find((service) => mode === 'OVERRIDE_EXCLUSION' ? service.turnExclusions.length > 0 : !['COMPLETED', 'CANCELLED'].includes(service.status))?.id ?? appointment.services[0]?.id ?? '');
  const [scope, setScope] = useState<'SERVICE' | 'VISIT'>('SERVICE');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [newServiceId, setNewServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [exclusionStaffId, setExclusionStaffId] = useState(appointment.services.find((service) => service.turnExclusions.length > 0)?.turnExclusions[0]?.staffId ?? '');
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(mode !== 'CANCEL' && mode !== 'OVERRIDE_EXCLUSION');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const close = useCallback(() => { if (!saving) onClose(); }, [onClose, saving]);
  const dialogRef = useDialogFocus(true, close);
  const serviceRows = useMemo(() => appointment.services.length ? appointment.services : [{ id: `${appointment.id}-service`, serviceId: appointment.serviceId, sequence: 1, serviceName: appointment.serviceName, durationMin: 0, amount: appointment.amount, status: appointment.status, primaryStaff: appointment.primaryStaff, turnExclusions: [] }], [appointment]);
  const selectedService = serviceRows.find((service) => service.id === serviceId) ?? serviceRows[0];
  const selectedExclusions = selectedService?.turnExclusions ?? [];
  const replacement = catalog.find((service) => service.id === newServiceId);
  const selectedStaff = staff.find((member) => member.id === staffId);
  const isStructuredAction = ['CANCEL', 'CHANGE_SERVICE', 'REASSIGN'].includes(mode);

  useEffect(() => {
    if (mode === 'CANCEL' || mode === 'OVERRIDE_EXCLUSION') return;
    const timer = window.setTimeout(() => {
      void Promise.all([
        mode === 'CHANGE_SERVICE' ? fetch('/api/services', { cache: 'no-store' }).then((response) => response.json()) : Promise.resolve(null),
        mode === 'REASSIGN' ? fetch('/api/admin/staff', { cache: 'no-store' }).then((response) => response.json()) : Promise.resolve(null),
      ]).then(([servicePayload, staffPayload]) => {
        if (servicePayload?.services) {
          const nextCatalog = servicePayload.services as CatalogService[];
          setCatalog(nextCatalog);
          setNewServiceId(nextCatalog.find((service) => service.id !== selectedService?.serviceId)?.id ?? '');
        }
        if (staffPayload?.staff) {
          const nextStaff = staffPayload.staff as Staff[];
          setStaff(nextStaff);
          setStaffId(nextStaff.find((member) => member.isActive && member.status === 'PRESENT' && member.availability === 'AVAILABLE')?.id ?? '');
        }
      }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load action options')).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, selectedService?.serviceId]);

  async function submit() {
    if (!reason.trim()) { setError('Add a reason to continue.'); return; }
    if (mode === 'CANCEL' && scope === 'SERVICE' && !serviceId) { setError('Choose a service to cancel.'); return; }
    if (mode === 'CHANGE_SERVICE' && !newServiceId) { setError('Choose a replacement service.'); return; }
    if (mode === 'REASSIGN' && (!serviceId || !staffId)) { setError('Choose a service and an available specialist.'); return; }
    if (mode === 'OVERRIDE_EXCLUSION' && (!serviceId || !exclusionStaffId)) { setError('Choose the skipped specialist to override.'); return; }
    setSaving(true); setError('');
    const idempotencyKey = `admin-${mode.toLowerCase()}-${appointment.id}-${Date.now()}`;
    const request = mode === 'CANCEL'
      ? { url: '/api/admin/appointments/cancel', body: { appointmentId: appointment.id, appointmentServiceId: scope === 'SERVICE' ? serviceId : undefined, scope, reason, confirmed, idempotencyKey } }
      : mode === 'CHANGE_SERVICE'
        ? { url: '/api/admin/appointments/change-service', body: { appointmentServiceId: serviceId, serviceId: newServiceId, reason, idempotencyKey } }
      : mode === 'REASSIGN'
        ? { url: '/api/admin/appointments/reassign', body: { appointmentServiceId: serviceId, staffId, reason, idempotencyKey } }
        : { url: '/api/admin/appointments/override-exclusion', body: { appointmentServiceId: serviceId, staffId: exclusionStaffId, reason, idempotencyKey } };
    try {
      const response = await fetch(request.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to complete manager action');
      onComplete(mode === 'CANCEL' ? `${appointment.code} cancelled.` : mode === 'CHANGE_SERVICE' ? `${appointment.code} service changed.` : mode === 'REASSIGN' ? `${appointment.code} reassigned.` : `Skip exclusion overridden for ${appointment.code}.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete manager action'); } finally { setSaving(false); }
  }

  const title = mode === 'CANCEL' ? 'Cancel appointment' : mode === 'CHANGE_SERVICE' ? 'Change service' : mode === 'REASSIGN' ? 'Reassign service' : 'Override skipped assignment';
  return <div className="modal-backdrop"><div className={`modal appointment-action-modal ${mode === 'CHANGE_SERVICE' ? 'change-service-modal' : mode === 'REASSIGN' ? 'reassign-service-modal' : mode === 'CANCEL' ? 'cancel-service-modal' : ''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-busy={loading} aria-labelledby="appointment-action-title"><div className="modal-header"><div><div className="eyebrow">Manager action</div><h2 id="appointment-action-title">{title}</h2><p>{appointment.code} · {appointment.customerName}</p></div><button type="button" className="modal-close" aria-label="Close manager action" onClick={close}><X size={18} aria-hidden="true" /></button></div>
    {mode === 'CANCEL' ? <div className="cancel-action-content"><div className="field cancel-scope-field"><span className="cancel-section-label">Cancellation scope</span><div className="cancel-scope-options" role="group" aria-label="Cancellation scope"><button type="button" className={`cancel-scope-option ${scope === 'SERVICE' ? 'active' : ''}`} aria-pressed={scope === 'SERVICE'} onClick={() => setScope('SERVICE')} disabled={saving}><strong>Selected service</strong><small>Keep other services</small></button><button type="button" className={`cancel-scope-option ${scope === 'VISIT' ? 'active' : ''}`} aria-pressed={scope === 'VISIT'} onClick={() => setScope('VISIT')} disabled={saving}><strong>Entire visit</strong><small>Cancel all eligible services</small></button></div><span className="field-hint">A whole visit cannot be cancelled after a service is complete or payment is pending.</span></div><div className="cancel-impact-card" aria-live="polite"><div className="cancel-impact-copy"><span>Cancellation preview</span><strong>{scope === 'VISIT' ? 'Entire visit' : selectedService?.serviceName ?? 'Selected service'}</strong><small>{scope === 'VISIT' ? `${serviceRows.length} ${serviceRows.length === 1 ? 'service' : 'services'} in this visit` : `${selectedService?.sequence ? `Service ${selectedService.sequence} · ` : ''}${selectedService?.status?.replace('_', ' ') ?? 'Ready to cancel'}`}</small></div><span className="cancel-impact-badge">{scope === 'VISIT' ? 'All eligible' : '1 service'}</span></div>{scope === 'SERVICE' ? <div className="field cancel-service-field"><label htmlFor="cancel-service"><span className="cancel-step">1</span><span>Service to cancel</span></label><select id="cancel-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={saving}>{serviceRows.filter((service) => !['COMPLETED', 'CANCELLED'].includes(service.status)).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName} · {service.status.replace('_', ' ')}</option>)}</select><span className="field-hint">Only this service will be cancelled; the rest of the visit stays unchanged.</span></div> : null}{scope === 'SERVICE' && selectedService?.status === 'IN_SERVICE' ? <label className="cancel-confirm-card"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Confirm active service cancellation</strong><small>I confirm cancelling work already in service.</small></span></label> : null}</div> : null}
    {mode === 'CHANGE_SERVICE' ? <><div className="change-service-summary" aria-label="Service change preview" aria-live="polite"><div className="change-service-card change-service-card-current"><div className="change-service-card-top"><span className="change-service-kicker">Current service</span><span className="change-service-state">Selected</span></div><strong>{selectedService?.serviceName ?? 'No service selected'}</strong><span>{formatServiceMeta(selectedService?.durationMin, selectedService?.amount, currency)}</span></div><div className="change-service-summary-arrow" aria-hidden="true"><ArrowRight size={20} /></div><div className="change-service-card change-service-card-replacement"><div className="change-service-card-top"><span className="change-service-kicker">Replacement</span><span className="change-service-state">{replacement ? 'New' : 'Choose below'}</span></div><strong>{replacement?.name ?? 'Choose a service'}</strong><span>{replacement ? formatServiceMeta(replacement.durationMin, replacement.price, currency) : 'Select a replacement below'}</span></div></div><div className="change-service-fields"><div className="field change-service-field"><label htmlFor="change-service-appointment"><span className="change-service-step">1</span><span>Service to change</span></label><select id="change-service-appointment" value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={loading || saving}>{serviceRows.filter((service) => !['COMPLETED', 'CANCELLED'].includes(service.status)).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName}</option>)}</select><span className="field-hint">{loading ? 'Loading appointment services…' : 'Select the service the guest no longer wants.'}</span></div><div className="field change-service-field"><label htmlFor="change-service-new"><span className="change-service-step">2</span><span>Replacement service</span></label><select id="change-service-new" value={newServiceId} onChange={(event) => setNewServiceId(event.target.value)} disabled={loading || saving}>{catalog.filter((service) => service.id !== selectedService?.serviceId).map((service) => <option key={service.id} value={service.id}>{service.name} · {formatMoney(service.price, currency)}</option>)}</select><span className="field-hint">{loading ? 'Loading available services…' : 'The new service will be routed using its required skills.'}</span></div></div></> : null}
    {mode === 'REASSIGN' ? <><div className="reassign-summary" aria-label="Reassignment preview" aria-live="polite"><div className="reassign-card reassign-current-card"><div className="reassign-card-top"><span className="reassign-kicker">Current assignment</span><span className="reassign-state">{selectedService?.primaryStaff ? 'Assigned' : 'Waiting'}</span></div><strong>{selectedService?.serviceName ?? 'No service selected'}</strong><span>{selectedService?.primaryStaff ? `Assigned to ${selectedService.primaryStaff.name}` : 'Waiting for an eligible specialist'}</span></div><div className="reassign-summary-arrow" aria-hidden="true"><ArrowRight size={20} /></div><div className="reassign-card reassign-new-card"><div className="reassign-card-top"><span className="reassign-kicker">New specialist</span><span className="reassign-state">{selectedStaff ? 'Available' : 'Choose below'}</span></div><strong>{selectedStaff?.name ?? 'Choose a specialist'}</strong><span>{selectedStaff ? 'Ready to take this service' : 'Select an available specialist below'}</span></div></div><div className="reassign-fields"><div className="field reassign-field"><label htmlFor="reassign-service"><span className="reassign-step">1</span><span>Service to move</span></label><select id="reassign-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={loading || saving}>{serviceRows.filter((service) => ['WAITING', 'ASSIGNED'].includes(service.status)).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName} · {service.status.replace('_', ' ')}</option>)}</select><span className="field-hint">{loading ? 'Loading appointment services…' : 'Choose the service that needs a new specialist.'}</span></div><div className="field reassign-field"><label htmlFor="reassign-staff"><span className="reassign-step">2</span><span>New specialist</span></label><select id="reassign-staff" value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={loading || saving}><option value="">Choose a specialist</option>{staff.filter((member) => member.isActive && member.status === 'PRESENT' && member.availability === 'AVAILABLE').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><span className="field-hint">{loading ? 'Loading available specialists…' : 'The specialist must match the service skills and be available.'}</span></div></div></> : null}
    {mode === 'OVERRIDE_EXCLUSION' ? <><div className="field"><label htmlFor="override-service">Service</label><select id="override-service" value={serviceId} onChange={(event) => { setServiceId(event.target.value); const next = serviceRows.find((service) => service.id === event.target.value); setExclusionStaffId(next?.turnExclusions[0]?.staffId ?? ''); }}>{serviceRows.filter((service) => service.turnExclusions.length > 0).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName}</option>)}</select></div><div className="field"><label htmlFor="override-staff">Skipped specialist</label><select id="override-staff" value={exclusionStaffId} onChange={(event) => setExclusionStaffId(event.target.value)}>{selectedExclusions.map((exclusion) => <option key={exclusion.staffId} value={exclusion.staffId}>{exclusion.staffName} · {exclusion.reason}</option>)}</select><span className="field-hint">This removes the skip for this specialist. Reassign the service separately if needed.</span></div></> : null}
    <div className={`field ${mode === 'CHANGE_SERVICE' ? 'change-service-reason-field' : mode === 'CANCEL' ? 'cancel-reason-field' : ''}`}><label htmlFor="appointment-action-reason"><span>Reason</span>{mode === 'CHANGE_SERVICE' || mode === 'CANCEL' ? <span className="change-service-required">Required</span> : null}</label><textarea id="appointment-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} rows={mode === 'CHANGE_SERVICE' || mode === 'CANCEL' ? 2 : 3} placeholder={mode === 'CHANGE_SERVICE' ? 'Example: Guest requested Nail Art instead' : mode === 'CANCEL' ? 'Example: Guest changed plans' : 'Reason for this change'} required />{mode === 'CHANGE_SERVICE' || mode === 'CANCEL' ? <span className="field-hint">This note is saved in the appointment turn history.</span> : null}</div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className={`form-actions ${isStructuredAction ? 'structured-action-actions' : ''}`}>{mode === 'CHANGE_SERVICE' ? <span className="structured-action-audit-note">The change will be recorded for this appointment.</span> : mode === 'REASSIGN' ? <span className="structured-action-audit-note">The reassignment will be recorded in turn history.</span> : mode === 'CANCEL' ? <span className="structured-action-audit-note">The cancellation will be recorded in turn history.</span> : null}<button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="button" className="button button-primary" onClick={() => void submit()} disabled={loading || saving}>{saving ? 'Saving…' : <><Check size={16} aria-hidden="true" />{mode === 'CHANGE_SERVICE' ? 'Apply change' : mode === 'REASSIGN' ? 'Apply reassignment' : mode === 'CANCEL' ? 'Cancel appointment' : 'Confirm'}</>}</button></div>
  </div></div>;
}

function formatMoney(value: number, currency: string) { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
function formatServiceMeta(durationMin: number | undefined, amount: number | undefined, currency: string) { return [durationMin ? `${durationMin} min` : null, amount === undefined ? null : formatMoney(amount, currency)].filter((value): value is string => Boolean(value)).join(' · '); }
