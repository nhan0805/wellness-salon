'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, RefreshCcw, X } from 'lucide-react';
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
    if (!reason.trim()) { setError('Add a reason so the manager action is auditable.'); return; }
    if (mode === 'CANCEL' && scope === 'SERVICE' && !serviceId) { setError('Choose a service to cancel.'); return; }
    if (mode === 'CHANGE_SERVICE' && !newServiceId) { setError('Choose a replacement service.'); return; }
    if (mode === 'REASSIGN' && (!serviceId || !staffId)) { setError('Choose a service and an available technician.'); return; }
    if (mode === 'OVERRIDE_EXCLUSION' && (!serviceId || !exclusionStaffId)) { setError('Choose the skipped technician to override.'); return; }
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

  const title = mode === 'CANCEL' ? 'Cancel appointment work' : mode === 'CHANGE_SERVICE' ? 'Change selected service' : mode === 'REASSIGN' ? 'Reassign technician' : 'Override skipped technician';
  return <div className="modal-backdrop"><div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="appointment-action-title"><div className="modal-header"><div><h2 id="appointment-action-title">{title}</h2><p>{appointment.code} · {appointment.customerName}</p></div><button type="button" className="modal-close" aria-label="Close manager action" onClick={close}><X size={18} aria-hidden="true" /></button></div>
    {mode === 'CANCEL' ? <><div className="field"><label htmlFor="cancel-scope">What should be cancelled?</label><select id="cancel-scope" value={scope} onChange={(event) => setScope(event.target.value as 'SERVICE' | 'VISIT')}><option value="SERVICE">One selected service</option><option value="VISIT">Whole visit</option></select><span className="field-hint">Whole-visit cancellation is rejected if any service is already completed or payment is pending.</span></div>{scope === 'SERVICE' ? <div className="field"><label htmlFor="cancel-service">Service</label><select id="cancel-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{serviceRows.filter((service) => !['COMPLETED', 'CANCELLED'].includes(service.status)).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName} · {service.status.replace('_', ' ')}</option>)}</select></div> : null}</> : null}
    {mode === 'CHANGE_SERVICE' ? <><div className="action-preview"><span>Current</span><strong>{selectedService?.serviceName} · {formatMoney(selectedService?.amount ?? 0, currency)}</strong><ArrowRight size={17} aria-hidden="true" /><span>New</span><strong>{replacement ? `${replacement.name} · ${formatMoney(replacement.price, currency)}` : 'Choose a replacement'}</strong></div><div className="field"><label htmlFor="change-service-appointment">Appointment service</label><select id="change-service-appointment" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{serviceRows.filter((service) => !['COMPLETED', 'CANCELLED'].includes(service.status)).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName}</option>)}</select></div><div className="field"><label htmlFor="change-service-new">Replacement service</label><select id="change-service-new" value={newServiceId} onChange={(event) => setNewServiceId(event.target.value)}>{catalog.filter((service) => service.id !== selectedService?.serviceId).map((service) => <option key={service.id} value={service.id}>{service.name} · {formatMoney(service.price, currency)}</option>)}</select></div></> : null}
    {mode === 'REASSIGN' ? <><div className="field"><label htmlFor="reassign-service">Appointment service</label><select id="reassign-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{serviceRows.filter((service) => ['WAITING', 'ASSIGNED'].includes(service.status)).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName} · {service.status.replace('_', ' ')}</option>)}</select></div><div className="field"><label htmlFor="reassign-staff">Available technician</label><select id="reassign-staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Choose a technician</option>{staff.filter((member) => member.isActive && member.status === 'PRESENT' && member.availability === 'AVAILABLE').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><span className="field-hint">Skill matching and exact-skip exclusions are rechecked on the server.</span></div></> : null}
    {mode === 'OVERRIDE_EXCLUSION' ? <><div className="field"><label htmlFor="override-service">Service</label><select id="override-service" value={serviceId} onChange={(event) => { setServiceId(event.target.value); const next = serviceRows.find((service) => service.id === event.target.value); setExclusionStaffId(next?.turnExclusions[0]?.staffId ?? ''); }}>{serviceRows.filter((service) => service.turnExclusions.length > 0).map((service) => <option key={service.id} value={service.id}>{service.sequence}. {service.serviceName}</option>)}</select></div><div className="field"><label htmlFor="override-staff">Skipped technician</label><select id="override-staff" value={exclusionStaffId} onChange={(event) => setExclusionStaffId(event.target.value)}>{selectedExclusions.map((exclusion) => <option key={exclusion.staffId} value={exclusion.staffId}>{exclusion.staffName} · {exclusion.reason}</option>)}</select><span className="field-hint">The override removes only this permanent exclusion. Routing or reassignment remains a separate manager action.</span></div></> : null}
    {mode === 'CANCEL' && selectedService?.status === 'IN_SERVICE' ? <label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm cancelling work already in service</label> : null}
    <div className="field"><label htmlFor="appointment-action-reason">Reason</label><textarea id="appointment-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} rows={3} placeholder="Record the operational reason" required /></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="form-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="button" className="button button-primary" onClick={() => void submit()} disabled={loading || saving}>{saving ? 'Saving…' : <><Check size={16} aria-hidden="true" /> Confirm</>}</button></div>
  </div></div>;
}

function formatMoney(value: number, currency: string) { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
