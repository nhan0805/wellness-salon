'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, LoaderCircle, RefreshCcw, Sparkles } from 'lucide-react';
import { ErrorMessage } from '@/src/components/ui';
import { ServiceIcon } from '@/src/components/service-icons';

type Service = { id: string; name: string; iconKey: string; durationMin: number; price: number };
function getServicePresentation(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('pedicure') || normalized.includes('spa')) return { description: 'A restorative treatment for hands and feet' };
  if (normalized.includes('art')) return { description: 'A playful finish with room for your signature style' };
  return { description: 'A polished, personalized treatment for your visit' };
}
type CustomerLookupState = 'idle' | 'checking' | 'found' | 'new' | 'error';

type Ticket = { code: string; appointmentId: string; status: string; serviceName: string; durationMin: number; amount: number; assignedStaffName: string | null; services: Array<{ id: string; sequence: number; name: string; durationMin: number; amount: number; status: string }>; message: string };

function getPhoneValidationMessage(value: string) {
  const normalized = value.trim();
  if (!normalized) return 'Enter your mobile number.';
  if (!/^[+0-9 ()-]+$/.test(normalized)) return 'Use digits, spaces, +, hyphens, or parentheses only.';
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 7) return 'Enter at least 7 digits for your mobile number.';
  if (digits.length > 15) return 'Enter no more than 15 digits for your mobile number.';
  return '';
}

export default function KioskPage() {
  const [step, setStep] = useState(1);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupState, setLookupState] = useState<CustomerLookupState>('idle');
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const checkInKeyRef = useRef<string | null>(null);
  const selectedServices = useMemo(() => selectedServiceIds.map((id) => services.find((service) => service.id === id)).filter((service): service is Service => Boolean(service)), [selectedServiceIds, services]);
  const selectedTotal = useMemo(() => selectedServices.reduce((total, service) => total + service.price, 0), [selectedServices]);
  const selectedDuration = useMemo(() => selectedServices.reduce((total, service) => total + service.durationMin, 0), [selectedServices]);

  useEffect(() => {
    let cancelled = false;
    async function loadServices() {
      try {
        const response = await fetch('/api/services', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Unable to load services');
        if (!cancelled) setServices(payload.services ?? []);
      } catch (err) {
        if (!cancelled) setCatalogError(err instanceof Error ? err.message : 'Unable to load services');
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void loadServices();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ticket) return;
    const timer = window.setTimeout(() => reset(), 30_000);
    return () => window.clearTimeout(timer);
  }, [ticket]);

  useEffect(() => {
    const normalizedPhone = phone.trim();
    if (step !== 2 || getPhoneValidationMessage(normalizedPhone)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLookupState('checking');
      setLookupError('');
      try {
        const response = await fetch(`/api/kiosk/customer-lookup?phone=${encodeURIComponent(normalizedPhone)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'Unable to check this number');
        if (cancelled) return;
        if (payload.found && payload.name) {
          setName(payload.name);
          setLookupState('found');
        } else {
          setName('');
          setLookupState('new');
        }
      } catch (err) {
        if (!cancelled) {
          setLookupState('error');
          setLookupError(err instanceof Error ? err.message : 'Unable to check this number');
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lookupAttempt, phone, step]);

  function reset() {
    setStep(1);
    setSelectedServiceIds([]);
    setPhone('');
    setName('');
    setTicket(null);
    setError('');
    setPhoneError('');
    setLookupError('');
    setLookupState('idle');
    setSubmitting(false);
    checkInKeyRef.current = null;
  }

  function continueFromService() { if (!selectedServices.length) return; setError(''); setStep(2); }

  function changeService() {
    setStep(1);
    setPhone('');
    setName('');
    setError('');
    setPhoneError('');
    setLookupError('');
    setLookupState('idle');
  }

  function handlePhoneChange(value: string) {
    setPhone(value);
    setName('');
    setError('');
    setPhoneError('');
    setLookupError('');
    setLookupState('idle');
  }

  function handlePhoneBlur() {
    const validationMessage = getPhoneValidationMessage(phone);
    setPhoneError(validationMessage);
    if (validationMessage) {
      setLookupState('idle');
      setLookupError('');
    }
  }

  async function submitCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = getPhoneValidationMessage(phone);
    if (validationMessage) {
      setPhoneError(validationMessage);
      document.getElementById('kiosk-phone')?.focus();
      return;
    }
    if (!selectedServices.length) return;
    if (lookupState === 'idle') {
      setError('We’re checking your number. Please wait a moment.');
      document.getElementById('kiosk-phone')?.focus();
      return;
    }
    if (!['found', 'new'].includes(lookupState) || lookupState === 'checking' || lookupState === 'error') return;
    if (name.trim().length < 2) {
      setError('Enter your name to continue.');
      document.getElementById('kiosk-name')?.focus();
      return;
    }
    setError(''); setSubmitting(true);
    try {
      const idempotencyKey = checkInKeyRef.current ?? `kiosk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      checkInKeyRef.current = idempotencyKey;
      const response = await fetch('/api/kiosk/check-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceIds: selectedServiceIds, phone, name, idempotencyKey }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to check in');
      setTicket(payload); setStep(3);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to check in'); } finally { setSubmitting(false); }
  }

  return <main className="kiosk-shell page-root">
    <header className="kiosk-header"><Link className="brand" href="/"><span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span><span className="brand-copy">Wellness Salon <small>Self check-in</small></span></Link><span className="status-badge status-success">Open today</span></header>
    <div className="kiosk-main"><div className="kiosk-panel">
      <div className="kiosk-progress" aria-label={`Step ${step} of 3`}><span className={`progress-step ${step >= 1 ? 'active' : ''}`}><span className="progress-dot">1</span> Service</span><span className="progress-line" /><span className={`progress-step ${step >= 2 ? 'active' : ''}`}><span className="progress-dot">2</span> Your details</span><span className="progress-line" /><span className={`progress-step ${step >= 3 ? 'active' : ''}`}><span className="progress-dot">3</span> Your turn</span></div>
      {step === 1 ? <section aria-labelledby="kiosk-title"><div className="kiosk-copy"><div className="eyebrow">Welcome in</div><h1 id="kiosk-title">What are we creating today?</h1><p>Choose one or more services for this visit. Each service will be routed to the right available specialist.</p></div>{catalogLoading ? <div className="card management-loading" role="status">Loading available services…</div> : catalogError ? <div className="management-error" role="alert">{catalogError}<button type="button" className="button button-quiet button-sm" onClick={() => window.location.reload()}>Retry</button></div> : <div className="service-grid">{services.map((service) => { const { description } = getServicePresentation(service.name); const isSelected = selectedServiceIds.includes(service.id); return <button key={service.id} type="button" className={`service-card ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedServiceIds((current) => isSelected ? current.filter((id) => id !== service.id) : [...current, service.id])} aria-pressed={isSelected}><div><div className="service-card-top"><span className="service-icon"><ServiceIcon iconKey={service.iconKey} size={28} aria-hidden="true" /></span>{isSelected ? <span className="status-badge status-blue">Selected</span> : null}</div><h3>{service.name}</h3><p>{description}</p></div><div className="service-card-footer"><span className="service-time"><Clock3 size={18} aria-hidden="true" /> {service.durationMin} min</span><span className="service-price">${service.price}</span></div></button>; })}{!services.length ? <div className="empty-state"><span>No services are available right now.</span></div> : null}</div>}<div className="kiosk-selection-summary" role="status" aria-live="polite"><span>{selectedServices.length ? `${selectedServices.length} service${selectedServices.length === 1 ? '' : 's'} selected · ${selectedDuration} min` : 'Select at least one service'}</span>{selectedServices.length ? <strong>${selectedTotal.toFixed(2)}</strong> : null}</div><div className="form-actions"><button type="button" className="button button-primary" disabled={catalogLoading || !!catalogError || !selectedServices.length} onClick={continueFromService}>Continue <ArrowRight size={17} aria-hidden="true" /></button></div></section> : null}
      {step === 2 ? <section className="card kiosk-form-card" aria-labelledby="details-title"><button className="button button-quiet button-sm" type="button" onClick={changeService}><ArrowLeft size={16} aria-hidden="true" /> Change service</button><div className="kiosk-copy" style={{ marginTop: 28 }}><div className="eyebrow">Almost there</div><h1 id="details-title" style={{ fontSize: 'clamp(2.3rem, 5vw, 3.6rem)' }}>How can we find you?</h1><p>Enter your mobile number first. We’ll recognize returning guests and only ask new guests for their name.</p></div><form className="form-grid" onSubmit={submitCheckIn}><div className="field"><label htmlFor="kiosk-phone">Mobile number</label><input id="kiosk-phone" name="phone" value={phone} onChange={(event) => handlePhoneChange(event.target.value)} onBlur={handlePhoneBlur} autoComplete="tel" inputMode="tel" placeholder="e.g. +1 415 555 0100" required minLength={7} aria-invalid={phoneError ? 'true' : undefined} aria-describedby={phoneError ? 'kiosk-phone-error kiosk-phone-hint' : 'kiosk-phone-hint'} />{phoneError ? <ErrorMessage id="kiosk-phone-error">{phoneError}</ErrorMessage> : null}<span className="field-hint" id="kiosk-phone-hint">Your number stays private and is never used for marketing.</span></div>{lookupState === 'checking' ? <div className="kiosk-lookup-status checking" role="status" aria-live="polite"><LoaderCircle className="spin" size={18} aria-hidden="true" /><span>Checking your number…</span></div> : null}{lookupState === 'found' ? <div className="kiosk-lookup-status found" role="status" aria-live="polite"><CheckCircle2 size={18} aria-hidden="true" /><span>Welcome back — we found your details.</span></div> : null}{lookupState === 'new' ? <div className="kiosk-lookup-status new" role="status" aria-live="polite"><span>New guest — enter your name to continue.</span></div> : null}{lookupState === 'error' ? <div className="kiosk-lookup-status error" role="alert"><span>{lookupError}</span><button className="button button-quiet button-sm" type="button" onClick={() => setLookupAttempt((attempt) => attempt + 1)}>Try again</button></div> : null}{lookupState === 'found' || lookupState === 'new' ? <div className="field"><label htmlFor="kiosk-name">{lookupState === 'found' ? 'Name on file' : 'First and last name'}</label><input id="kiosk-name" name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="e.g. Jamie Lee" readOnly={lookupState === 'found'} required minLength={2} className={lookupState === 'found' ? 'lookup-name-input' : undefined} /><span className="field-hint">{lookupState === 'found' ? 'We’ll use this name for your turn.' : 'This is your first visit with this number.'}</span></div> : null}{error ? <ErrorMessage>{error}</ErrorMessage> : null}<div className="form-actions"><button className="button button-primary" disabled={submitting || lookupState === 'checking' || lookupState === 'error'}>{submitting ? 'Joining the board…' : <>Join the turn board <ArrowRight size={17} aria-hidden="true" /></>}</button></div></form></section> : null}
      {step === 3 && ticket ? <section className="card kiosk-confirm-card" aria-labelledby="ticket-title"><div className="eyebrow">You’re checked in</div><h1 id="ticket-title" className="ticket-code">{ticket.code}</h1><p className="ticket-message">{ticket.message}</p><div className="ticket-service-list">{ticket.services.map((service) => <div className="ticket-service-row" key={service.id}><span>{service.sequence}. {service.name}<small>{service.durationMin} min</small></span><strong>${service.amount.toFixed(2)}</strong></div>)}</div><div className="ticket-summary"><div className="ticket-summary-item"><small>Total duration</small><strong>{ticket.durationMin} min</strong></div><div className="ticket-summary-item"><small>Total</small><strong>${ticket.amount.toFixed(2)}</strong></div></div><div className={`status-badge ${ticket.assignedStaffName ? 'status-blue' : 'status-warning'}`}>{ticket.assignedStaffName ? `Assigned to ${ticket.assignedStaffName}` : 'Waiting for an eligible specialist'}</div><p className="subtle" style={{ margin: '18px 0 0' }}>Please keep this code in mind. This screen resets automatically in 30 seconds.</p><div className="form-actions" style={{ justifyContent: 'center' }}><button className="button button-outline" onClick={reset}><RefreshCcw size={16} aria-hidden="true" /> New check-in</button></div></section> : null}
    </div></div>
  </main>;
}
