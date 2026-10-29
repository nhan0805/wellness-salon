'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  RefreshCcw,
  Search,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { ErrorMessage } from '@/src/components/ui';
import { ServiceIcon } from '@/src/components/service-icons';
import {
  ApiResponseError,
  getApiErrorMessage,
  parseApiResponse,
} from '@/src/client/api-response';
import { isWithinOperatingHours } from '@/src/domain/operating-hours';
import { DEFAULT_TIMEZONE } from '@/src/domain/locale-options';

type ServiceCategory = { id: string; name: string; slug: string; sortOrder: number };
type Service = {
  id: string;
  name: string;
  description: string;
  iconKey: string;
  category: ServiceCategory;
  durationMin: number;
  price: number;
};
type Shop = { timezone: string; openingTime: string; closingTime: string; currency: string };
function getFallbackServiceDescription(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('pedicure') || normalized.includes('spa'))
    return 'A restorative treatment for hands and feet';
  if (normalized.includes('art')) return 'A playful finish with room for your signature style';
  return 'A polished, personalized treatment for your visit';
}
type Ticket = {
  code: string;
  appointmentId: string;
  status: string;
  serviceName: string;
  durationMin: number;
  amount: number;
  assignedStaffName: string | null;
  services: Array<{
    id: string;
    sequence: number;
    name: string;
    durationMin: number;
    amount: number;
    status: string;
  }>;
  message: string;
};

function getPhoneValidationMessage(value: string) {
  const normalized = value.trim();
  if (!normalized) return 'Enter your mobile number.';
  if (!/^[+0-9 ()-]+$/.test(normalized))
    return 'Use digits, spaces, +, hyphens, or parentheses only.';
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [shop, setShop] = useState<Shop>({
    timezone: DEFAULT_TIMEZONE,
    openingTime: '09:00',
    closingTime: '21:00',
    currency: 'USD',
  });
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const checkInKeyRef = useRef<string | null>(null);
  const previousStepRef = useRef(step);
  const selectedServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => services.find((service) => service.id === id))
        .filter((service): service is Service => Boolean(service)),
    [selectedServiceIds, services],
  );
  const selectedTotal = useMemo(
    () => selectedServices.reduce((total, service) => total + service.price, 0),
    [selectedServices],
  );
  const selectedDuration = useMemo(
    () => selectedServices.reduce((total, service) => total + service.durationMin, 0),
    [selectedServices],
  );
  const serviceGroups = useMemo(() => {
    const groups = new Map<string, { category: ServiceCategory; services: Service[] }>();
    for (const service of services) {
      const current = groups.get(service.category.id);
      if (current) current.services.push(service);
      else groups.set(service.category.id, { category: service.category, services: [service] });
    }
    return [...groups.values()].sort(
      (left, right) =>
        left.category.sortOrder - right.category.sortOrder ||
        left.category.name.localeCompare(right.category.name),
    );
  }, [services]);
  const normalizedServiceSearch = serviceSearch.trim().toLowerCase();
  const visibleServiceGroups = useMemo(() => {
    const groups =
      categoryFilter === 'all'
        ? serviceGroups
        : serviceGroups.filter((group) => group.category.id === categoryFilter);
    if (!normalizedServiceSearch) return groups;
    return groups
      .map((group) => ({
        ...group,
        services: group.services.filter((service) =>
          [service.name, service.description, group.category.name].some((value) =>
            value.toLowerCase().includes(normalizedServiceSearch),
          ),
        ),
      }))
      .filter((group) => group.services.length);
  }, [categoryFilter, normalizedServiceSearch, serviceGroups]);
  const visibleServiceCount = useMemo(
    () => visibleServiceGroups.reduce((total, group) => total + group.services.length, 0),
    [visibleServiceGroups],
  );
  const formatMoney = useCallback(
    (value: number) =>
      new Intl.NumberFormat(undefined, { style: 'currency', currency: shop.currency }).format(
        value,
      ),
    [shop.currency],
  );
  const isShopOpen = useMemo(() => {
    return isWithinOperatingHours(new Date(clockNow), shop);
  }, [clockNow, shop]);

  const categoryIds = useMemo(
    () => ['all', ...serviceGroups.map((group) => group.category.id)],
    [serviceGroups],
  );

  function handleCategoryKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? categoryIds.length - 1
          : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + categoryIds.length) %
            categoryIds.length;
    const nextId = categoryIds[nextIndex];
    setCategoryFilter(nextId);
    window.requestAnimationFrame(() => document.getElementById('kiosk-category-' + nextId)?.focus());
  }

  useEffect(() => {
    const refreshClock = () => setClockNow(Date.now());
    const interval = window.setInterval(refreshClock, 30_000);
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    const targetId = step === 1 ? 'kiosk-title' : step === 2 ? 'details-title' : 'ticket-title';
    window.requestAnimationFrame(() => document.getElementById(targetId)?.focus());
  }, [step]);

  useEffect(() => {
    let disposed = false;
    let timedOut = false;
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    let timeoutId: number | undefined;
    async function loadServices() {
      try {
        const request = fetch('/api/services', {
          cache: 'default',
          ...(controller ? { signal: controller.signal } : {}),
        });
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            controller?.abort();
            reject(new Error('Services are taking too long to load.'));
          }, 12_000);
        });
        const response = await Promise.race([request, timeout]);
        const payload = await parseApiResponse<{
          services?: Service[];
          shop?: Shop;
        }>(response, 'Unable to load services');
        setServices(payload.services ?? []);
        if (payload.shop) setShop(payload.shop);
        setCatalogError('');
      } catch (err) {
        if (disposed) return;
        if (timedOut)
          setCatalogError(
            'Services are taking too long to load. Check the kiosk connection and try again.',
          );
        else if (!(err instanceof Error && err.name === 'AbortError'))
          setCatalogError(getApiErrorMessage(err, 'Unable to load services'));
      } finally {
        window.clearTimeout(timeoutId);
        if (!disposed) setCatalogLoading(false);
      }
    }
    void loadServices();
    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [catalogAttempt]);

  useEffect(() => {
    if (!ticket) return;
    const timer = window.setTimeout(() => reset(), 30_000);
    return () => window.clearTimeout(timer);
  }, [ticket]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  function reset() {
    setStep(1);
    setSelectedServiceIds([]);
    setCategoryFilter('all');
    setServiceSearch('');
    setPhone('');
    setName('');
    setTicket(null);
    setError('');
    setPhoneError('');
    setSubmitting(false);
    checkInKeyRef.current = null;
  }

  function continueFromService() {
    if (!selectedServices.length) return;
    setError('');
    setStep(2);
  }

  function changeService() {
    checkInKeyRef.current = null;
    setStep(1);
    setPhone('');
    setName('');
    setError('');
    setPhoneError('');
  }

  function handlePhoneChange(value: string) {
    checkInKeyRef.current = null;
    setPhone(value);
    setName('');
    setError('');
    setPhoneError('');
  }

  function handleNameChange(value: string) {
    checkInKeyRef.current = null;
    setName(value);
    setError('');
  }

  function toggleService(serviceId: string) {
    checkInKeyRef.current = null;
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }

  function handlePhoneBlur() {
    const validationMessage = getPhoneValidationMessage(phone);
    setPhoneError(validationMessage);
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
    if (!isOnline) {
      setError('The kiosk is offline. Reconnect before checking in; your request has not been sent.');
      return;
    }
    if (!isShopOpen) {
      setError(`Check-in is available from ${shop.openingTime} to ${shop.closingTime}.`);
      return;
    }
    if (name.trim().length < 2) {
      setError('Enter your name to continue.');
      document.getElementById('kiosk-name')?.focus();
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const idempotencyKey =
        checkInKeyRef.current ?? `kiosk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      checkInKeyRef.current = idempotencyKey;
      const response = await fetch('/api/kiosk/check-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceIds: selectedServiceIds, phone, name, idempotencyKey }),
      });
      const payload = await parseApiResponse<Ticket>(response, 'Unable to check in');
      setTicket(payload);
      setStep(3);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        const errorPayload = err.payload;
        if (
          errorPayload &&
          typeof errorPayload === 'object' &&
          'code' in errorPayload &&
          errorPayload.code === 'KIOSK_CHECK_IN_CLOSED'
        ) {
          const details = errorPayload as {
            openingTime?: string;
            closingTime?: string;
            timezone?: string;
          };
          setShop((current) => ({
            ...current,
            openingTime: details.openingTime ?? current.openingTime,
            closingTime: details.closingTime ?? current.closingTime,
            timezone: details.timezone ?? current.timezone,
          }));
        }
      }
      const networkFailure = typeof navigator !== 'undefined' && !navigator.onLine;
      const unknownResult = networkFailure || err instanceof TypeError;
      setError(
        unknownResult
          ? 'We could not confirm the check-in because the kiosk connection was interrupted. No success was shown; check the connection and retry. The same request will be reused to prevent a duplicate visit.'
          : getApiErrorMessage(err, 'Unable to check in'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="kiosk-shell page-root">
      <header className="kiosk-header">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Sparkles size={19} aria-hidden="true" />
          </span>
          <span className="brand-copy">
            Wellness Salon <small>Self check-in</small>
          </span>
        </Link>
        <span
          className={`status-badge kiosk-open-status ${isShopOpen ? 'status-success' : 'status-warning'}`}
        >
          <span className="kiosk-open-status-dot" aria-hidden="true" />
          <span className="kiosk-status-label">{isShopOpen ? 'Open now' : 'Closed'}</span>
          <span aria-hidden="true">·</span>
          <span className="kiosk-status-hours">
            {shop.openingTime}–{shop.closingTime}
          </span>
        </span>
      </header>
      <div className="kiosk-main">
        {!isOnline ? (
          <div className="kiosk-offline-banner" role="alert">
            <WifiOff size={20} aria-hidden="true" />
            <div>
              <strong>Connection interrupted</strong>
              <span>Reconnect to load services or submit a check-in. Nothing has been sent.</span>
            </div>
          </div>
        ) : null}
        <div className="kiosk-panel">
          <div className="kiosk-progress" role="list" aria-label={`Step ${step} of 3`}>
            <span
              role="listitem"
              className={`progress-step ${step >= 1 ? 'active' : ''}`}
              aria-current={step === 1 ? 'step' : undefined}
            >
              <span className="progress-dot">1</span>
              <span className="progress-step-label">Service</span>
            </span>
            <span className="progress-line" />
            <span
              role="listitem"
              className={`progress-step ${step >= 2 ? 'active' : ''}`}
              aria-current={step === 2 ? 'step' : undefined}
            >
              <span className="progress-dot">2</span>
              <span className="progress-step-label">
                <span className="progress-label-long">Your details</span>
                <span className="progress-label-short" aria-hidden="true">
                  Details
                </span>
              </span>
            </span>
            <span className="progress-line" />
            <span
              role="listitem"
              className={`progress-step ${step >= 3 ? 'active' : ''}`}
              aria-current={step === 3 ? 'step' : undefined}
            >
              <span className="progress-dot">3</span>
              <span className="progress-step-label">
                <span className="progress-label-long">Your turn</span>
                <span className="progress-label-short" aria-hidden="true">
                  Turn
                </span>
              </span>
            </span>
          </div>
          {step === 1 && !isShopOpen ? (
            <div className="kiosk-closed-banner" role="status">
              <span className="kiosk-closed-icon">
                <Clock3 size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>Check-in is currently closed</strong>
                <span>
                  We’ll be ready for new guests from {shop.openingTime} to {shop.closingTime}.
                </span>
              </div>
            </div>
          ) : null}
          {step === 1 ? (
            <section className="kiosk-service-picker-card" aria-labelledby="kiosk-title">
              <div className="kiosk-copy">
                <div className="eyebrow">Services</div>
                <h1 id="kiosk-title" tabIndex={-1}>Choose your services</h1>
                <p>
                  Select one or more services for this visit. We’ll match each service with an
                  available specialist.
                </p>
              </div>
              {catalogLoading ? (
                <div className="card management-loading" role="status">
                  Loading available services…
                </div>
              ) : catalogError ? (
                <div className="management-error" role="alert">
                  {catalogError}
                  <button
                    type="button"
                    className="button button-quiet button-sm"
                    onClick={() => {
                      setCatalogError('');
                      setCatalogLoading(true);
                      setCatalogAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="kiosk-catalog-toolbar">
                    <div className="kiosk-service-search">
                      <Search size={18} aria-hidden="true" />
                      <label className="sr-only" htmlFor="kiosk-service-search">
                        Search services
                      </label>
                      <input
                        id="kiosk-service-search"
                        name="service-search"
                        type="search"
                        value={serviceSearch}
                        onChange={(event) => setServiceSearch(event.target.value)}
                        placeholder="Search services"
                        autoComplete="off"
                        enterKeyHint="search"
                      />
                      {serviceSearch ? (
                        <button
                          type="button"
                          className="kiosk-service-search-clear"
                          onClick={() => setServiceSearch('')}
                          aria-label="Clear service search"
                        >
                          <X size={17} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <span className="kiosk-catalog-result-count" aria-live="polite">
                      {visibleServiceCount} service{visibleServiceCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div
                    className="service-category-nav"
                    role="tablist"
                    aria-label="Service categories"
                  >
                    <button
                      type="button"
                      role="tab"
                      id="kiosk-category-all"
                      aria-controls="kiosk-service-category-panel"
                      aria-selected={categoryFilter === 'all'}
                      tabIndex={categoryFilter === 'all' ? 0 : -1}
                      className={`service-category-chip ${categoryFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('all')}
                      onKeyDown={(event) => handleCategoryKeyDown(event, 0)}
                    >
                      All services <span>{services.length}</span>
                    </button>
                    {serviceGroups.map((group, index) => (
                      <button
                        type="button"
                        role="tab"
                        id={`kiosk-category-${group.category.id}`}
                        aria-controls="kiosk-service-category-panel"
                        key={group.category.id}
                        aria-selected={categoryFilter === group.category.id}
                        tabIndex={categoryFilter === group.category.id ? 0 : -1}
                        className={`service-category-chip ${categoryFilter === group.category.id ? 'active' : ''}`}
                        onClick={() => setCategoryFilter(group.category.id)}
                        onKeyDown={(event) => handleCategoryKeyDown(event, index + 1)}
                      >
                        {group.category.name} <span>{group.services.length}</span>
                      </button>
                    ))}
                  </div>
                  <div
                    className="service-category-groups"
                    id="kiosk-service-category-panel"
                    role="tabpanel"
                    tabIndex={-1}
                    aria-labelledby={`kiosk-category-${categoryFilter}`}
                  >
                    {visibleServiceGroups.map((group) => {
                      const headingId = `service-category-${group.category.slug}`;
                      return (
                        <section
                          className="service-category-section"
                          key={group.category.id}
                          aria-labelledby={headingId}
                        >
                          <div className="service-category-heading">
                            <h2 id={headingId}>{group.category.name}</h2>
                            <span>
                              {group.services.length} service
                              {group.services.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="service-grid">
                            {group.services.map((service) => {
                              const description =
                                service.description.trim() ||
                                getFallbackServiceDescription(service.name);
                              const isSelected = selectedServiceIds.includes(service.id);
                              return (
                                <button
                                  key={service.id}
                                  type="button"
                                  className={`service-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() =>
                                    toggleService(service.id)
                                  }
                                  aria-pressed={isSelected}
                                >
                                  <div>
                                    <div className="service-card-top">
                                      <span className="service-icon">
                                        <ServiceIcon
                                          iconKey={service.iconKey}
                                          size={28}
                                          aria-hidden="true"
                                        />
                                      </span>
                                      {isSelected ? (
                                        <span className="status-badge status-blue">Selected</span>
                                      ) : null}
                                    </div>
                                    <h3>{service.name}</h3>
                                    <p>{description}</p>
                                  </div>
                                  <div className="service-card-footer">
                                    <span className="service-time">
                                      <Clock3 size={18} aria-hidden="true" /> {service.durationMin}{' '}
                                      min
                                    </span>
                                    <span className="service-price">
                                      {formatMoney(service.price)}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                    {!visibleServiceGroups.length ? (
                      <div className="empty-state">
                        <span>No services are available right now.</span>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
              <div className="kiosk-step-actions">
                <div className="kiosk-selection-summary" role="status" aria-live="polite">
                  <span>
                    {selectedServices.length
                      ? `${selectedServices.length} service${selectedServices.length === 1 ? '' : 's'} selected · ${selectedDuration} min`
                      : 'Select at least one service'}
                  </span>
                  {selectedServices.length ? <strong>{formatMoney(selectedTotal)}</strong> : null}
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={
                      catalogLoading || !!catalogError || !selectedServices.length || !isShopOpen
                    }
                    onClick={continueFromService}
                  >
                    Continue <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          {step === 2 ? (
            <section className="card kiosk-form-card" aria-labelledby="details-title">
              <button
                className="button button-quiet button-sm"
                type="button"
                onClick={changeService}
              >
                <ArrowLeft size={16} aria-hidden="true" /> Change services
              </button>
              <div className="kiosk-copy" style={{ marginTop: 28 }}>
                <div className="eyebrow">Your details</div>
                <h1 id="details-title" tabIndex={-1} style={{ fontSize: 'clamp(2.3rem, 5vw, 3.6rem)' }}>
                  Enter your details
                </h1>
                <p>
                  Enter your mobile number and name. For privacy, we never reveal whether this
                  number has visited before.
                </p>
              </div>
              <form className="form-grid" onSubmit={submitCheckIn}>
                <div className="field">
                  <label htmlFor="kiosk-phone">Mobile number</label>
                  <input
                    id="kiosk-phone"
                    name="phone"
                    value={phone}
                    onChange={(event) => handlePhoneChange(event.target.value)}
                    onBlur={handlePhoneBlur}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="e.g. +1 415 555 0100"
                    required
                    minLength={7}
                    aria-invalid={phoneError ? 'true' : undefined}
                    aria-describedby={
                      phoneError ? 'kiosk-phone-error kiosk-phone-hint' : 'kiosk-phone-hint'
                    }
                  />
                  {phoneError ? (
                    <ErrorMessage id="kiosk-phone-error">{phoneError}</ErrorMessage>
                  ) : null}
                  <span className="field-hint" id="kiosk-phone-hint">
                    We use your number to find your salon profile and never for marketing.
                  </span>
                </div>
                {phone.trim() && !getPhoneValidationMessage(phone) ? (
                  <div className="kiosk-lookup-status new" role="status" aria-live="polite">
                    <span>Number looks good — enter your name to continue. We keep guest history private.</span>
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="kiosk-name">First and last name</label>
                  <input
                    id="kiosk-name"
                    name="name"
                    value={name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    autoComplete="name"
                    placeholder="e.g. Jamie Lee"
                    required
                    minLength={2}
                  />
                  <span className="field-hint">We use this name for today’s visit only.</span>
                </div>
                {error ? <ErrorMessage>{error}</ErrorMessage> : null}
                <div className="form-actions">
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? (
                      'Checking you in…'
                    ) : (
                      <>
                        Check in <ArrowRight size={17} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
          {step === 3 && ticket ? (
            <section className="card kiosk-confirm-card" aria-labelledby="ticket-title">
              <div className="eyebrow">You’re checked in</div>
              <h1 id="ticket-title" tabIndex={-1} className="ticket-code">
                {ticket.code}
              </h1>
              <p className="ticket-message">{ticket.message}</p>
              <div className="ticket-service-list">
                {ticket.services.map((service) => (
                  <div className="ticket-service-row" key={service.id}>
                    <span>
                      {service.sequence}. {service.name}
                      <small>{service.durationMin} min</small>
                    </span>
                    <strong>{formatMoney(service.amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="ticket-summary">
                <div className="ticket-summary-item">
                  <small>Total duration</small>
                  <strong>{ticket.durationMin} min</strong>
                </div>
                <div className="ticket-summary-item">
                  <small>Total</small>
                  <strong>{formatMoney(ticket.amount)}</strong>
                </div>
              </div>
              <div
                className={`status-badge ${ticket.assignedStaffName ? 'status-blue' : 'status-warning'}`}
              >
                {ticket.assignedStaffName
                  ? `Assigned to ${ticket.assignedStaffName}`
                  : 'Waiting for a specialist'}
              </div>
              <p className="subtle" style={{ margin: '18px 0 0' }}>
                Keep this check-in code. This screen resets automatically in 30 seconds.
              </p>
              <div className="form-actions" style={{ justifyContent: 'center' }}>
                <button className="button button-outline" onClick={reset}>
                  <RefreshCcw size={16} aria-hidden="true" /> New check-in
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
