'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  BadgeCheck,
  CalendarClock,
  Edit3,
  History,
  Layers3,
  LoaderCircle,
  Monitor,
  Plus,
  RefreshCcw,
  RotateCcw,
  Scissors,
  Search,
  Tags,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { InitialsAvatar, SectionHeader, StatusBadge } from '@/src/components/ui';
import { DEFAULT_SERVICE_ICON_KEY, type ServiceIconKey } from '@/src/domain/service-icons';
import { PinKeypad } from '@/src/components/pin-keypad';
import { ServiceIcon, ServiceIconPicker } from '@/src/components/service-icons';
import { useDialogFocus } from '@/src/components/use-dialog-focus';
import { parseApiResponse } from '@/src/client/api-response';
import {
  fetchWithTimeout,
  isAbortError,
  RequestTimeoutError,
} from '@/src/client/fetch-with-timeout';

type ManagementKind = 'attendance' | 'customers' | 'staff' | 'services';
type Attendance = {
  staffId: string;
  staffName: string;
  initials: string;
  isActive: boolean;
  status: 'PRESENT' | 'CHECKED_OUT' | 'ABSENT';
  availability: 'AVAILABLE' | 'BUSY';
  checkInAt: string | null;
  checkOutAt: string | null;
  closedBy: 'STAFF' | 'ADMIN' | 'AUTO' | null;
};
type Customer = {
  id: string;
  name: string;
  phone: string;
  appointmentCount: number;
  lastVisitAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Skill = { id: string; name: string };
type Staff = {
  id: string;
  name: string;
  initials: string;
  skills: Skill[];
  isActive: boolean;
  status: Attendance['status'];
  availability: Attendance['availability'];
  checkInAt: string | null;
  checkOutAt: string | null;
};
type ServiceCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
};
type Service = {
  id: string;
  name: string;
  description: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  category: Pick<ServiceCategory, 'id' | 'name' | 'slug' | 'sortOrder'>;
  durationMin: number;
  price: number;
  requiredSkills: Skill[];
  isActive: boolean;
  appointmentCount: number;
  createdAt: string;
  updatedAt: string;
};
type CustomerHistoryStatus =
  | 'CREATED'
  | 'WAITING'
  | 'ASSIGNED'
  | 'IN_SERVICE'
  | 'PAYMENT_PENDING'
  | 'COMPLETED'
  | 'CANCELLED';
type CustomerHistoryItem = {
  id: string;
  code: string;
  businessDate: string;
  createdAt: string;
  completedAt: string | null;
  serviceName: string;
  durationMin: number;
  staffName: string | null;
  status: CustomerHistoryStatus;
  amount: number;
  services: Array<{
    id: string;
    sequence: number;
    serviceName: string;
    durationMin: number;
    amount: number;
    status: CustomerHistoryStatus;
    staffName: string | null;
  }>;
  payment: {
    amount: number;
    tip: number;
    total: number;
    method: 'CARD' | 'CASH';
    confirmedAt: string;
  } | null;
};
type CustomerHistoryPayload = {
  customer: { id: string; name: string; phone: string };
  summary: {
    visitCount: number;
    completedCount: number;
    paidTotal: number;
    tipTotal: number;
    totalCollected: number;
  };
  history: CustomerHistoryItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type ManagementApiPayload = {
  attendance?: Attendance[];
  customers?: Customer[];
  pagination?: { total?: number };
  staff?: Staff[];
  skills?: Skill[];
  services?: Service[];
  categories?: ServiceCategory[];
  skipped?: boolean;
  reason?: string;
  closedCount?: number;
  deferredCount?: number;
};

type CustomerForm = { name: string; phone: string };
type StaffForm = { name: string; pin: string; skillIds: string[]; isActive: boolean };
type ServiceForm = {
  name: string;
  description: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  durationMin: string;
  price: string;
  skillIds: string[];
  isActive: boolean;
};
type ServiceCategoryForm = { name: string; sortOrder: string; isActive: boolean };
type ModalState =
  | { type: 'customer'; record?: Customer }
  | { type: 'staff'; record?: Staff }
  | { type: 'service'; record?: Service }
  | { type: 'category'; record?: ServiceCategory }
  | null;

const endpointByKind: Record<ManagementKind, string> = {
  attendance: '/api/admin/attendance',
  customers: '/api/admin/customers',
  staff: '/api/admin/staff',
  services: '/api/admin/services',
};
const titleByKind: Record<ManagementKind, string> = {
  attendance: 'Attendance',
  customers: 'Customers',
  staff: 'Staff',
  services: 'Services',
};
const ADMIN_MANAGEMENT_REQUEST_TIMEOUT_MS = 10_000;
const ADMIN_MUTATION_REQUEST_TIMEOUT_MS = 15_000;
const serviceCategoryEndpoint = '/api/admin/service-categories';
const historyStatusOptions: Array<{ value: CustomerHistoryStatus; label: string }> = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAYMENT_PENDING', label: 'Payment pending' },
  { value: 'IN_SERVICE', label: 'In service' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'CREATED', label: 'Created' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
export function AdminManagement({
  kind,
  currency,
  onToast,
}: {
  kind: ManagementKind;
  currency: string;
  onToast: (message: string) => void;
}) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [serviceTab, setServiceTab] = useState<'services' | 'categories'>('services');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadSequenceRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const customerQuery =
        kind === 'customers'
          ? `?search=${encodeURIComponent(customerSearch.trim())}&page=${customerPage}&pageSize=50`
          : '';
      const response = await fetchWithTimeout(
        endpointByKind[kind] + customerQuery,
        { cache: 'no-store', signal: controller.signal },
        ADMIN_MANAGEMENT_REQUEST_TIMEOUT_MS,
      );
      const payload = await parseApiResponse<ManagementApiPayload>(
        response,
        'Unable to load this section',
      );
      if (sequence !== loadSequenceRef.current) return;
      if (kind === 'attendance') setAttendance(payload.attendance ?? []);
      if (kind === 'customers') {
        setCustomers(payload.customers ?? []);
        setCustomerTotal(payload.pagination?.total ?? payload.customers?.length ?? 0);
      }
      if (kind === 'staff') {
        setStaff(payload.staff ?? []);
        setSkills(payload.skills ?? []);
      }
      if (kind === 'services') {
        setServices(payload.services ?? []);
        setSkills(payload.skills ?? []);
        setServiceCategories(payload.categories ?? []);
      }
    } catch (loadError) {
      if (sequence !== loadSequenceRef.current || isAbortError(loadError)) return;
      setError(
        loadError instanceof RequestTimeoutError
          ? `${titleByKind[kind]} took too long to load. Please try again.`
          : loadError instanceof Error
            ? loadError.message
            : 'Unable to load this section',
      );
    } finally {
      if (sequence === loadSequenceRef.current) {
        setLoading(false);
        if (loadControllerRef.current === controller) loadControllerRef.current = null;
      }
    }
  }, [customerPage, customerSearch, kind]);

  // This effect intentionally synchronizes the selected admin module with its API adapter.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      loadControllerRef.current?.abort();
    };
  }, [load]);

  async function request(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<ManagementApiPayload> {
    const response = await fetchWithTimeout(
      path,
      {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
      ADMIN_MUTATION_REQUEST_TIMEOUT_MS,
    );
    return parseApiResponse<ManagementApiPayload>(
      response,
      'The operation could not be completed',
    );
  }

  async function submit(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
    message = 'Saved',
  ) {
    setBusy(true);
    setFormError('');
    try {
      await request(path, method, body);
      setModal(null);
      onToast(message);
      await load();
      return true;
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'The operation could not be completed';
      if (method === 'POST') {
        // A network timeout can leave a mutation in an unknown state. Refresh the
        // list before presenting the error so operators can verify whether it landed.
        try {
          await load();
          setFormError(`${message} The list was refreshed; verify the record before retrying.`);
        } catch {
          setFormError(`${message} The result is unknown. Refresh the list before retrying.`);
        }
      } else {
        setFormError(message);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateAttendance(record: Attendance) {
    setBusyId(record.staffId);
    setError('');
    try {
      await request(endpointByKind.attendance, 'POST', {
        staffId: record.staffId,
        action: record.status === 'PRESENT' ? 'CHECK_OUT' : 'CHECK_IN',
        idempotencyKey: `admin-attendance-${record.staffId}-${record.status === 'PRESENT' ? 'out' : 'in'}-${Date.now()}`,
      });
      onToast(
        `${record.staffName} is now ${record.status === 'PRESENT' ? 'checked out' : 'checked in'}.`,
      );
      await load();
    } catch (attendanceError) {
      setError(
        attendanceError instanceof Error ? attendanceError.message : 'Unable to update attendance',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function runClosing() {
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/jobs/closing', 'POST');
      if (result.skipped) {
        onToast(result.reason ?? 'Closing time has not been reached.');
        await load();
        return;
      }
      const closedCount = typeof result.closedCount === 'number' ? result.closedCount : 0;
      const deferredCount = typeof result.deferredCount === 'number' ? result.deferredCount : 0;
      onToast(
        deferredCount
          ? `Shift closing completed. ${closedCount} staff checked out; ${deferredCount} remain checked in.`
          : `Shift closed. ${closedCount} staff checked out.`,
      );
      await load();
    } catch (closingError) {
      setError(
        closingError instanceof Error ? closingError.message : 'Unable to run closing review',
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomer(record: Customer) {
    if (
      record.appointmentCount > 0 ||
      !window.confirm(`Delete ${record.name}? This cannot be undone.`)
    )
      return;
    await submit(
      `${endpointByKind.customers}?id=${encodeURIComponent(record.id)}`,
      'DELETE',
      undefined,
      `${record.name} deleted.`,
    );
  }

  async function toggleStaff(record: Staff) {
    await submit(
      endpointByKind.staff,
      'PATCH',
      {
        id: record.id,
        name: record.name,
        pin: '',
        skillIds: record.skills.map((skill) => skill.id),
        isActive: !record.isActive,
      },
      record.isActive ? `${record.name} deactivated.` : `${record.name} reactivated.`,
    );
  }

  async function archiveService(record: Service) {
    if (!window.confirm(`Archive ${record.name} from the kiosk catalog?`)) return;
    await submit(
      `${endpointByKind.services}?id=${encodeURIComponent(record.id)}`,
      'DELETE',
      undefined,
      `${record.name} archived.`,
    );
  }

  async function archiveServiceCategory(record: ServiceCategory) {
    if (!window.confirm(`Archive ${record.name}? Active services must be moved first.`)) return;
    await submit(
      `${serviceCategoryEndpoint}?id=${encodeURIComponent(record.id)}`,
      'DELETE',
      undefined,
      `${record.name} archived.`,
    );
  }

  function openModal(next: ModalState) {
    setFormError('');
    setModal(next);
  }

  const title =
    kind === 'attendance'
      ? 'Attendance'
      : kind === 'customers'
        ? 'Customers'
        : kind === 'staff'
          ? 'Staff'
          : 'Services';
  const description =
    kind === 'attendance'
      ? 'Check staff in and out and close the shift. Complete payments before closing; cancel any unserved visits.'
      : kind === 'customers'
        ? 'Manage guest profiles used to recognize repeat visits.'
        : kind === 'staff'
          ? 'Manage skills, PIN access, attendance, and availability.'
          : 'Manage the services shown on the customer kiosk, their categories, and the skills required to provide them.';
  const visibleServices =
    serviceCategoryFilter === 'all'
      ? services
      : services.filter((service) => service.categoryId === serviceCategoryFilter);
  const activeServiceCategories = serviceCategories.filter((category) => category.isActive);
  const visibleCustomers = customers;
  const presentStaffCount = attendance.filter((record) => record.status === 'PRESENT').length;
  const availableStaffCount = attendance.filter(
    (record) => record.status === 'PRESENT' && record.availability === 'AVAILABLE',
  ).length;
  const totalCustomerVisits = customers.reduce(
    (total, customer) => total + customer.appointmentCount,
    0,
  );
  const activeStaffCount = staff.filter((record) => record.isActive).length;
  const readyStaffCount = staff.filter(
    (record) =>
      record.isActive && record.status === 'PRESENT' && record.availability === 'AVAILABLE',
  ).length;
  const activeServiceCount = services.filter((service) => service.isActive).length;
  const activeCategoryCount = serviceCategories.filter((category) => category.isActive).length;

  return (
    <>
      <SectionHeader
        eyebrow={
          kind === 'attendance'
            ? 'Daily attendance'
            : kind === 'customers'
              ? 'Guest records'
              : kind === 'staff'
                ? 'Team management'
                : 'Service catalog'
        }
        title={title}
        description={description}
        action={
          kind === 'attendance' ? (
            <button
              type="button"
              className="button button-primary button-sm close-shift-button"
              onClick={runClosing}
              disabled={busy}
            >
              <RefreshCcw size={16} aria-hidden="true" /> Close shift
            </button>
          ) : (
            <button
              className="button button-primary button-sm"
              onClick={() =>
                openModal(
                  kind === 'customers'
                    ? { type: 'customer' }
                    : kind === 'staff'
                      ? { type: 'staff' }
                      : serviceTab === 'categories'
                        ? { type: 'category' }
                        : { type: 'service' },
                )
              }
              disabled={loading || busy}
            >
              <Plus size={15} aria-hidden="true" /> Add{' '}
              {kind === 'customers'
                ? 'customer'
                : kind === 'staff'
                  ? 'staff member'
                  : serviceTab === 'categories'
                    ? 'category'
                    : 'service'}
            </button>
          )
        }
      />
      {error ? (
        <div className="management-error" role="alert">
          <X size={17} aria-hidden="true" />
          {error}
          <button className="button button-quiet button-sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}
      {!loading && kind === 'attendance' ? (
        <div className="management-summary-grid" aria-label="Attendance summary">
          <div className="management-summary-item management-summary-item-success">
            <span>Present</span>
            <strong>{presentStaffCount}</strong>
            <small>checked in today</small>
          </div>
          <div className="management-summary-item management-summary-item-blue">
            <span>Available</span>
            <strong>{availableStaffCount}</strong>
            <small>ready for assignments</small>
          </div>
          <div className="management-summary-item management-summary-item-neutral">
            <span>Team size</span>
            <strong>{attendance.length}</strong>
            <small>active records</small>
          </div>
        </div>
      ) : null}
      {!loading && kind === 'customers' ? (
        <div className="management-summary-grid" aria-label="Customer summary">
          <div className="management-summary-item management-summary-item-blue">
            <span>Guests</span>
            <strong>{customerTotal}</strong>
            <small>profiles matching this view</small>
          </div>
          <div className="management-summary-item management-summary-item-neutral">
            <span>Visits</span>
            <strong>{totalCustomerVisits}</strong>
            <small>appointments on this page</small>
          </div>
          <div className="management-summary-item management-summary-item-success">
            <span>Page</span>
            <strong>{customerPage}</strong>
            <small>{visibleCustomers.length} profiles shown</small>
          </div>
        </div>
      ) : null}
      {!loading && kind === 'staff' ? (
        <div className="management-summary-grid" aria-label="Staff summary">
          <div className="management-summary-item management-summary-item-blue">
            <span>Active staff</span>
            <strong>{activeStaffCount}</strong>
            <small>available in the directory</small>
          </div>
          <div className="management-summary-item management-summary-item-success">
            <span>Ready now</span>
            <strong>{readyStaffCount}</strong>
            <small>checked in and available</small>
          </div>
          <div className="management-summary-item management-summary-item-neutral">
            <span>Skills mapped</span>
            <strong>{skills.length}</strong>
            <small>matching definitions</small>
          </div>
        </div>
      ) : null}
      {!loading && kind === 'services' ? (
        <div className="management-summary-grid" aria-label="Services summary">
          <div className="management-summary-item management-summary-item-blue">
            <span>Live services</span>
            <strong>{activeServiceCount}</strong>
            <small>visible on the kiosk</small>
          </div>
          <div className="management-summary-item management-summary-item-success">
            <span>Categories</span>
            <strong>{activeCategoryCount}</strong>
            <small>active kiosk groups</small>
          </div>
          <div className="management-summary-item management-summary-item-neutral">
            <span>Catalog total</span>
            <strong>{services.length}</strong>
            <small>including archived services</small>
          </div>
        </div>
      ) : null}
      {kind === 'services' ? (
        <div className="service-catalog-tabs" role="tablist" aria-label="Service catalog sections">
          <button
            type="button"
            role="tab"
            aria-selected={serviceTab === 'services'}
            className={`service-catalog-tab ${serviceTab === 'services' ? 'active' : ''}`}
            onClick={() => setServiceTab('services')}
          >
            <Scissors size={17} aria-hidden="true" /> Services <span>{services.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={serviceTab === 'categories'}
            className={`service-catalog-tab ${serviceTab === 'categories' ? 'active' : ''}`}
            onClick={() => setServiceTab('categories')}
          >
            <Layers3 size={17} aria-hidden="true" /> Categories{' '}
            <span>{serviceCategories.length}</span>
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="card management-loading" role="status">
          <LoaderCircle size={22} className="spin" aria-hidden="true" /> Loading{' '}
          {title.toLowerCase()}…
        </div>
      ) : (
        <div className="card card-pad management-card">
          {kind === 'customers' ? (
            <div className="customer-directory-toolbar">
              <div>
                <span className="eyebrow">Guest directory</span>
                <strong>Find a repeat visitor</strong>
                <small>Search by name or mobile number.</small>
              </div>
              <label className="customer-search-field">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search customers</span>
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value);
                    setCustomerPage(1);
                  }}
                  placeholder="Search name or phone"
                />
              </label>
            </div>
          ) : null}
          {kind === 'attendance' ? (
            <AttendanceTable rows={attendance} busyId={busyId} onToggle={updateAttendance} />
          ) : null}
          {kind === 'customers' ? (
            <CustomersTable
              rows={visibleCustomers}
              onEdit={(record) => openModal({ type: 'customer', record })}
              onDelete={deleteCustomer}
              onHistory={setHistoryCustomer}
            />
          ) : null}
          {kind === 'customers' && customerTotal > 50 ? (
            <div className="management-pagination" aria-label="Customer directory pages">
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}
                disabled={customerPage <= 1}
              >
                Previous
              </button>
              <span>
                Page {customerPage} of {Math.ceil(customerTotal / 50)}
              </span>
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() =>
                  setCustomerPage((page) => Math.min(Math.ceil(customerTotal / 50), page + 1))
                }
                disabled={customerPage >= Math.ceil(customerTotal / 50)}
              >
                Next
              </button>
            </div>
          ) : null}
          {kind === 'staff' ? (
            <StaffTable
              rows={staff}
              onEdit={(record) => openModal({ type: 'staff', record })}
              onToggle={toggleStaff}
            />
          ) : null}
          {kind === 'services' && serviceTab === 'services' ? (
            <>
              <div className="service-catalog-toolbar">
                <div>
                  <strong>
                    {visibleServices.length} service{visibleServices.length === 1 ? '' : 's'}
                  </strong>
                  <span>Organized by category for the kiosk</span>
                </div>
                <div className="field service-category-filter">
                  <label htmlFor="service-category-filter">Filter by category</label>
                  <select
                    id="service-category-filter"
                    value={serviceCategoryFilter}
                    onChange={(event) => setServiceCategoryFilter(event.target.value)}
                  >
                    <option value="all">All categories</option>
                    {serviceCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.isActive ? '' : ' · Archived'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ServicesTable
                rows={visibleServices}
                currency={currency}
                onEdit={(record) => openModal({ type: 'service', record })}
                onArchive={archiveService}
              />
            </>
          ) : null}
          {kind === 'services' && serviceTab === 'categories' ? (
            <ServiceCategoriesTable
              rows={serviceCategories}
              onEdit={(record) => openModal({ type: 'category', record })}
              onArchive={archiveServiceCategory}
            />
          ) : null}
        </div>
      )}
      {historyCustomer ? (
        <CustomerHistoryModal
          customer={historyCustomer}
          currency={currency}
          onClose={() => setHistoryCustomer(null)}
        />
      ) : null}
      {modal?.type === 'customer' ? (
        <RecordModal
          title={modal.record ? 'Edit customer' : 'Add customer'}
          description="Keep the phone number accurate so kiosk check-in can recognize the guest."
          error={formError}
          onClose={() => setModal(null)}
        >
          <CustomerForm
            record={modal.record}
            busy={busy}
            onCancel={() => setModal(null)}
            onSubmit={(values) =>
              submit(
                endpointByKind.customers,
                modal.record ? 'PATCH' : 'POST',
                modal.record ? { ...values, id: modal.record.id } : values,
                modal.record ? 'Customer updated.' : 'Customer added.',
              )
            }
          />
        </RecordModal>
      ) : null}
      {modal?.type === 'staff' ? (
        <RecordModal
          title={modal.record ? 'Edit staff member' : 'Add staff member'}
          description="Initials are generated from the name. Staff need at least one skill before they can be assigned an appointment."
          error={formError}
          wide
          onClose={() => setModal(null)}
        >
          <StaffForm
            record={modal.record}
            skills={skills}
            busy={busy}
            onCancel={() => setModal(null)}
            onSubmit={(values) =>
              submit(
                endpointByKind.staff,
                modal.record ? 'PATCH' : 'POST',
                modal.record ? { ...values, id: modal.record.id } : values,
                modal.record ? 'Staff member updated.' : 'Staff member added.',
              )
            }
          />
        </RecordModal>
      ) : null}
      {modal?.type === 'service' ? (
        <RecordModal
          title={modal.record ? 'Edit service' : 'Add service'}
          description="Active services appear on the kiosk. Category organizes the catalog; skills still control staff assignment."
          error={formError}
          wide
          onClose={() => setModal(null)}
        >
          <ServiceForm
            record={modal.record}
            currency={currency}
            categories={activeServiceCategories}
            skills={skills}
            busy={busy}
            onCancel={() => setModal(null)}
            onSubmit={(values) =>
              submit(
                endpointByKind.services,
                modal.record ? 'PATCH' : 'POST',
                modal.record
                  ? {
                      ...values,
                      id: modal.record.id,
                      durationMin: Number(values.durationMin),
                      price: Number(values.price),
                    }
                  : {
                      ...values,
                      durationMin: Number(values.durationMin),
                      price: Number(values.price),
                    },
                modal.record ? 'Service updated.' : 'Service added.',
              )
            }
          />
        </RecordModal>
      ) : null}
      {modal?.type === 'category' ? (
        <RecordModal
          className="category-modal"
          title={modal.record ? 'Edit category' : 'Add category'}
          description="Categories organize services on the admin catalog and customer kiosk."
          error={formError}
          onClose={() => setModal(null)}
        >
          <ServiceCategoryForm
            record={modal.record}
            busy={busy}
            onCancel={() => setModal(null)}
            onSubmit={(values) =>
              submit(
                serviceCategoryEndpoint,
                modal.record ? 'PATCH' : 'POST',
                modal.record
                  ? { ...values, id: modal.record.id, sortOrder: Number(values.sortOrder) }
                  : { ...values, sortOrder: Number(values.sortOrder) },
                modal.record ? 'Category updated.' : 'Category added.',
              )
            }
          />
        </RecordModal>
      ) : null}
    </>
  );
}

function AttendanceTable({
  rows,
  busyId,
  onToggle,
}: {
  rows: Attendance[];
  busyId: string | null;
  onToggle: (record: Attendance) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={CalendarClock}
        title="No staff records"
        description="Add staff members before managing attendance."
      />
    );
  return (
    <div
      className="admin-table-wrap attendance-table-wrap table-overflow-region"
      role="region"
      aria-label="Staff attendance table"
      tabIndex={0}
    >
      <p className="table-overflow-hint">Swipe horizontally to see all columns</p>
      <table className="admin-table management-table attendance-management-table">
        <caption className="sr-only">Staff attendance for today</caption>
        <thead>
          <tr>
            <th>Staff</th>
            <th>Presence</th>
            <th>Availability</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const availability = availabilityPresentation(row.status, row.availability);
            return (
              <tr key={row.staffId}>
                <td data-label="Staff">
                  <div className="table-customer">
                    <InitialsAvatar initials={row.initials} tone="blue" />
                    <div>
                      <strong>{row.staffName}</strong>
                      <small>{row.isActive ? 'Active staff' : 'Inactive staff'}</small>
                    </div>
                  </div>
                </td>
                <td data-label="Presence">
                  <StatusBadge
                    label={
                      row.status === 'PRESENT'
                        ? 'Present'
                        : row.status === 'CHECKED_OUT'
                          ? 'Checked out'
                          : 'Not checked in'
                    }
                    tone={
                      row.status === 'PRESENT'
                        ? 'success'
                        : row.status === 'CHECKED_OUT'
                          ? 'neutral'
                          : 'warning'
                    }
                  />
                </td>
                <td data-label="Availability">
                  <StatusBadge label={availability.label} tone={availability.tone} />
                </td>
                <td data-label="Check-in" className="subtle">
                  {formatDateTime(row.checkInAt)}
                </td>
                <td data-label="Check-out" className="subtle">
                  {formatDateTime(row.checkOutAt)}
                  {row.closedBy ? (
                    <small className="table-note">via {row.closedBy.toLowerCase()}</small>
                  ) : null}
                </td>
                <td data-label="Actions">
                  {row.isActive ? (
                    <button
                      className="button button-outline button-sm"
                      onClick={() => onToggle(row)}
                      disabled={busyId === row.staffId}
                    >
                      {busyId === row.staffId
                        ? 'Saving…'
                        : row.status === 'PRESENT'
                          ? 'Check out'
                          : 'Check in'}
                    </button>
                  ) : (
                    <span className="subtle">Inactive</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomerHistoryModal({
  customer,
  currency,
  onClose,
}: {
  customer: Customer;
  currency: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CustomerHistoryPayload | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<CustomerHistoryStatus | ''>('');
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const initializedCustomerIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (
      filters: { from: string; to: string; status: CustomerHistoryStatus | '' } = {
        from,
        to,
        status,
      },
      page = historyPage,
    ) => {
      setLoading(true);
      setError('');
      const query = new URLSearchParams();
      if (filters.from) query.set('from', filters.from);
      if (filters.to) query.set('to', filters.to);
      if (filters.status) query.set('status', filters.status);
      query.set('page', String(page));
      query.set('pageSize', '25');
      try {
        const response = await fetchWithTimeout(
          '/api/admin/customers/' +
            encodeURIComponent(customer.id) +
            '/history?' +
            query.toString(),
          { cache: 'no-store' },
          ADMIN_MANAGEMENT_REQUEST_TIMEOUT_MS,
        );
        const payload = await parseApiResponse<CustomerHistoryPayload>(
          response,
          'Unable to load customer history',
        );
        setData(payload);
      } catch (historyError) {
        setError(
          historyError instanceof Error ? historyError.message : 'Unable to load customer history',
        );
      } finally {
        setLoading(false);
      }
    },
    [customer.id, from, historyPage, status, to],
  );

  // Load the first page once when a customer history modal opens.
  useEffect(() => {
    if (initializedCustomerIdRef.current === customer.id) return;
    initializedCustomerIdRef.current = customer.id;
    const timer = window.setTimeout(() => {
      setHistoryPage(1);
      void load({ from: '', to: '', status: '' }, 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customer.id, load]);

  function resetFilters() {
    setFrom('');
    setTo('');
    setStatus('');
    setHistoryPage(1);
    void load({ from: '', to: '', status: '' }, 1);
  }

  function applyFilters() {
    setHistoryPage(1);
    void load({ from, to, status }, 1);
  }

  return (
    <RecordModal
      title="Customer history"
      description={`${customer.name} · ${customer.phone}`}
      error={error}
      wide
      onClose={onClose}
    >
      <form
        className="history-filters"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="field">
          <label htmlFor="history-from">From</label>
          <input
            id="history-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="history-to">To</label>
          <input
            id="history-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="history-status">Status</label>
          <select
            id="history-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as CustomerHistoryStatus | '')}
          >
            <option value="">All statuses</option>
            {historyStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="history-filter-actions">
          <button className="button button-primary button-sm" type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Apply filters'}
          </button>
          <button
            className="button button-quiet button-sm"
            type="button"
            onClick={resetFilters}
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </form>
      {loading && !data ? (
        <div className="management-loading" role="status">
          <LoaderCircle size={22} className="spin" aria-hidden="true" /> Loading history…
        </div>
      ) : data ? (
        <>
          <div className="history-summary" aria-label="Customer history summary">
            <div className="history-stat">
              <span>Visits</span>
              <strong>{data.summary.visitCount}</strong>
            </div>
            <div className="history-stat">
              <span>Services</span>
              <strong>{formatManagementMoney(data.summary.paidTotal, currency)}</strong>
              <small>{data.summary.completedCount} completed · tips excluded</small>
            </div>
            <div className="history-stat">
              <span>Tips</span>
              <strong>{formatManagementMoney(data.summary.tipTotal, currency)}</strong>
            </div>
            <div className="history-stat">
              <span>Total collected</span>
              <strong>{formatManagementMoney(data.summary.totalCollected, currency)}</strong>
              <small>Services + tips</small>
            </div>
          </div>
          {data.history.length ? (
            <div className="admin-table-wrap history-table-wrap">
              <table className="admin-table history-table">
                <caption className="sr-only">Transaction history for {customer.name}</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Visit</th>
                    <th>Services</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((item) => (
                    <tr key={item.id}>
                      <td className="subtle">
                        {formatHistoryDate(item.businessDate)}
                        <small className="table-note">{formatDateTime(item.createdAt)}</small>
                      </td>
                      <td>
                        <strong>{item.code}</strong>
                        <small className="table-note">
                          {item.services.length} service{item.services.length === 1 ? '' : 's'}
                        </small>
                      </td>
                      <td>
                        <div className="history-service-list">
                          {item.services.map((service) => (
                            <div key={service.id}>
                              <strong>{service.serviceName}</strong>
                              <small className="table-note">
                                {service.durationMin} min ·{' '}
                                {formatManagementMoney(service.amount, currency)}
                                {service.staffName ? ` · ${service.staffName}` : ''}
                              </small>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          label={formatStatus(item.status)}
                          tone={historyStatusTone(item.status)}
                        />
                      </td>
                      <td>
                        {item.payment ? (
                          <>
                            <strong>{formatManagementMoney(item.payment.total, currency)}</strong>
                            <small className="table-note">
                              {item.payment.method === 'CARD' ? 'Card' : 'Cash'}
                              {item.payment.tip
                                ? ` · ${formatManagementMoney(item.payment.tip, currency)} tip`
                                : ''}
                            </small>
                          </>
                        ) : (
                          <span className="subtle">Not paid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="history-empty">
              <History size={24} aria-hidden="true" />
              <strong>No transactions match these filters.</strong>
              <span>Try a different date range or status.</span>
            </div>
          )}
          {data.pagination.totalPages > 1 ? (
            <div className="management-pagination" aria-label="Customer history pages">
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() => {
                  const nextPage = Math.max(1, historyPage - 1);
                  setHistoryPage(nextPage);
                  void load({ from, to, status }, nextPage);
                }}
                disabled={historyPage <= 1 || loading}
              >
                Previous
              </button>
              <span>
                Page {historyPage} of {data.pagination.totalPages}
              </span>
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() => {
                  const nextPage = Math.min(data.pagination.totalPages, historyPage + 1);
                  setHistoryPage(nextPage);
                  void load({ from, to, status }, nextPage);
                }}
                disabled={historyPage >= data.pagination.totalPages || loading}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </RecordModal>
  );
}

function CustomersTable({
  rows,
  onEdit,
  onDelete,
  onHistory,
}: {
  rows: Customer[];
  onEdit: (record: Customer) => void;
  onDelete: (record: Customer) => void;
  onHistory: (record: Customer) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={Users}
        title="No customers yet"
        description="Add a guest profile or let the kiosk create one at check-in."
      />
    );
  return (
    <div className="admin-table-wrap">
      <table className="admin-table management-table customers-management-table">
        <caption className="sr-only">Customer records</caption>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Phone</th>
            <th>Visits</th>
            <th>Last visit</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="table-customer">
                  <InitialsAvatar initials={initialsFor(row.name)} tone="slate" />
                  <div>
                    <strong>{row.name}</strong>
                    <small>Added {formatDate(row.createdAt)}</small>
                  </div>
                </div>
              </td>
              <td>{row.phone}</td>
              <td>{row.appointmentCount}</td>
              <td className="subtle">{formatDate(row.lastVisitAt)}</td>
              <td>
                <div className="table-actions">
                  <button className="button button-quiet button-sm" onClick={() => onHistory(row)}>
                    <History size={15} aria-hidden="true" /> History
                  </button>
                  <button className="button button-quiet button-sm" onClick={() => onEdit(row)}>
                    <Edit3 size={15} aria-hidden="true" /> Edit
                  </button>
                  <button
                    className="button button-quiet button-sm"
                    onClick={() => onDelete(row)}
                    disabled={row.appointmentCount > 0}
                    title={
                      row.appointmentCount > 0
                        ? 'Customers with appointment history cannot be deleted'
                        : 'Delete customer'
                    }
                  >
                    <Trash2 size={15} aria-hidden="true" /> Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffTable({
  rows,
  onEdit,
  onToggle,
}: {
  rows: Staff[];
  onEdit: (record: Staff) => void;
  onToggle: (record: Staff) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={BadgeCheck}
        title="No staff yet"
        description="Add your first staff member with skills and a PIN."
      />
    );
  return (
    <div className="admin-table-wrap">
      <table className="admin-table management-table staff-management-table">
        <caption className="sr-only">Staff records</caption>
        <thead>
          <tr>
            <th>Staff</th>
            <th>Skills</th>
            <th>Presence</th>
            <th>Availability</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const availability = availabilityPresentation(row.status, row.availability);
            return (
              <tr key={row.id}>
                <td>
                  <div className="table-customer">
                    <InitialsAvatar initials={row.initials} tone="blue" />
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.initials}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="tag-list">
                    {row.skills.map((skill) => (
                      <span className="tag" key={skill.id}>
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <StatusBadge
                    label={
                      row.status === 'PRESENT'
                        ? 'Present'
                        : row.status === 'CHECKED_OUT'
                          ? 'Checked out'
                          : 'Not checked in'
                    }
                    tone={row.status === 'PRESENT' ? 'success' : 'neutral'}
                  />
                </td>
                <td>
                  <StatusBadge label={availability.label} tone={availability.tone} />
                </td>
                <td>
                  <StatusBadge
                    label={row.isActive ? 'Active' : 'Inactive'}
                    tone={row.isActive ? 'success' : 'neutral'}
                  />
                </td>
                <td>
                  <div className="table-actions">
                    <button className="button button-quiet button-sm" onClick={() => onEdit(row)}>
                      <Edit3 size={15} aria-hidden="true" /> Edit
                    </button>
                    <button className="button button-quiet button-sm" onClick={() => onToggle(row)}>
                      {row.isActive ? (
                        <>
                          <Archive size={15} aria-hidden="true" /> Deactivate
                        </>
                      ) : (
                        <>
                          <RotateCcw size={15} aria-hidden="true" /> Reactivate
                        </>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ServicesTable({
  rows,
  currency,
  onEdit,
  onArchive,
}: {
  rows: Service[];
  currency: string;
  onEdit: (record: Service) => void;
  onArchive: (record: Service) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={Scissors}
        title="No services yet"
        description="Add a service to make it available on the kiosk."
      />
    );
  return (
    <div
      className="admin-table-wrap table-overflow-region"
      role="region"
      aria-label="Service catalog table"
      tabIndex={0}
    >
      <p className="table-overflow-hint">Swipe horizontally to see all columns</p>
      <table className="admin-table management-table services-management-table">
        <caption className="sr-only">Service catalog</caption>
        <thead>
          <tr>
            <th className="service-icon-column" scope="col">
              Icon
            </th>
            <th>Service</th>
            <th>Category</th>
            <th>Duration</th>
            <th>Price</th>
            <th>Required skills</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="service-icon-cell" data-label="Icon">
                <span className="service-table-icon">
                  <ServiceIcon iconKey={row.iconKey} size={20} aria-hidden="true" />
                </span>
              </td>
              <td data-label="Service">
                <strong>{row.name}</strong>
                <small className="table-note">
                  {row.appointmentCount} appointment{row.appointmentCount === 1 ? '' : 's'}
                </small>
              </td>
              <td data-label="Category">
                <span className="tag service-category-tag">{row.category.name}</span>
              </td>
              <td data-label="Duration">{row.durationMin} min</td>
              <td data-label="Price">
                <strong>{formatManagementMoney(row.price, currency)}</strong>
              </td>
              <td data-label="Required skills">
                <div className="tag-list">
                  {row.requiredSkills.map((skill) => (
                    <span className="tag" key={skill.id}>
                      {skill.name}
                    </span>
                  ))}
                </div>
              </td>
              <td data-label="Status">
                <StatusBadge
                  label={row.isActive ? 'Active' : 'Archived'}
                  tone={row.isActive ? 'success' : 'neutral'}
                />
              </td>
              <td data-label="Actions">
                <div className="table-actions service-table-actions">
                  <button className="button button-quiet button-sm" onClick={() => onEdit(row)}>
                    <Edit3 size={15} aria-hidden="true" /> Edit
                  </button>
                  {row.isActive ? (
                    <button
                      className="button button-quiet button-sm"
                      onClick={() => onArchive(row)}
                    >
                      <Archive size={15} aria-hidden="true" /> Archive
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceCategoriesTable({
  rows,
  onEdit,
  onArchive,
}: {
  rows: ServiceCategory[];
  onEdit: (record: ServiceCategory) => void;
  onArchive: (record: ServiceCategory) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={Tags}
        title="No categories yet"
        description="Add a category before creating services."
      />
    );
  return (
    <div className="admin-table-wrap">
      <table className="admin-table management-table category-management-table categories-management-table">
        <caption className="sr-only">Service categories</caption>
        <thead>
          <tr>
            <th>Order</th>
            <th>Category</th>
            <th>Services</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="category-order">{row.sortOrder + 1}</span>
              </td>
              <td>
                <strong>{row.name}</strong>
              </td>
              <td>
                {row.serviceCount} service{row.serviceCount === 1 ? '' : 's'}
              </td>
              <td>
                <StatusBadge
                  label={row.isActive ? 'Active' : 'Archived'}
                  tone={row.isActive ? 'success' : 'neutral'}
                />
              </td>
              <td>
                <div className="table-actions service-table-actions">
                  <button className="button button-quiet button-sm" onClick={() => onEdit(row)}>
                    <Edit3 size={15} aria-hidden="true" /> Edit
                  </button>
                  {row.isActive ? (
                    <button
                      className="button button-quiet button-sm"
                      onClick={() => onArchive(row)}
                    >
                      <Archive size={15} aria-hidden="true" /> Archive
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerForm({
  record,
  busy,
  onCancel,
  onSubmit,
}: {
  record?: Customer;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerForm) => Promise<boolean>;
}) {
  const [values, setValues] = useState<CustomerForm>({
    name: record?.name ?? '',
    phone: record?.phone ?? '',
  });
  return (
    <form
      className="form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(values);
      }}
    >
      <div className="admin-form-grid">
        <div className="field">
          <label htmlFor="customer-name">Full name</label>
          <input
            id="customer-name"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
          />
        </div>
        <div className="field">
          <label htmlFor="customer-phone">Mobile number</label>
          <input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(event) => setValues({ ...values, phone: event.target.value })}
            autoComplete="tel"
            required
            minLength={7}
            maxLength={20}
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Saving…' : record ? 'Save changes' : 'Add customer'}
        </button>
      </div>
    </form>
  );
}

function StaffForm({
  record,
  skills,
  busy,
  onCancel,
  onSubmit,
}: {
  record?: Staff;
  skills: Skill[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: StaffForm) => Promise<boolean>;
}) {
  const [values, setValues] = useState<StaffForm>({
    name: record?.name ?? '',
    pin: '',
    skillIds: record?.skills.map((skill) => skill.id) ?? [],
    isActive: record?.isActive ?? true,
  });
  const [localError, setLocalError] = useState('');
  const toggleSkill = (skillId: string) =>
    setValues((current) => ({
      ...current,
      skillIds: current.skillIds.includes(skillId)
        ? current.skillIds.filter((id) => id !== skillId)
        : [...current.skillIds, skillId],
    }));
  return (
    <form
      className="form-grid staff-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!record && values.pin.length !== 4) {
          setLocalError('Enter a 4-digit PIN.');
          return;
        }
        if (record && values.pin.length !== 0 && values.pin.length !== 4) {
          setLocalError('Enter all 4 digits or leave the PIN blank to keep the current PIN.');
          return;
        }
        if (!values.skillIds.length) {
          setLocalError('Choose at least one skill.');
          return;
        }
        setLocalError('');
        await onSubmit(values);
      }}
    >
      <div className="admin-form-grid admin-form-grid-two staff-form-top-grid">
        <div className="field staff-name-field">
          <label htmlFor="staff-name">Full name</label>
          <input
            id="staff-name"
            type="text"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
          />
        </div>
        <PinKeypad
          value={values.pin}
          onChange={(pin) => setValues((current) => ({ ...current, pin }))}
          maxLength={4}
          label={record ? 'New PIN (optional)' : '4-digit PIN'}
          hint={
            record
              ? 'Leave empty to keep the current PIN.'
              : 'Choose a 4-digit PIN for staff verification.'
          }
          disabled={busy}
        />
      </div>
      <fieldset className="skill-fieldset">
        <legend>Skills</legend>
        <p className="field-hint">Services this staff member can perform.</p>
        <div className="checkbox-grid">
          {skills.map((skill) => (
            <label className="checkbox-option" key={skill.id}>
              <input
                type="checkbox"
                checked={values.skillIds.includes(skill.id)}
                onChange={() => toggleSkill(skill.id)}
              />
              <span>{skill.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {record ? (
        <fieldset className="assignment-availability-fieldset">
          <legend>Assignment availability</legend>
          <label className="assignment-availability-toggle">
            <span className="assignment-availability-copy">
              <strong>Available for new assignments</strong>
              <small id="staff-assignment-availability-hint">
                When on, this staff member can receive new service assignments.
              </small>
            </span>
            <span className="assignment-availability-switch">
              <input
                id="staff-assignment-availability"
                type="checkbox"
                role="switch"
                checked={values.isActive}
                aria-describedby="staff-assignment-availability-hint"
                onChange={(event) => setValues({ ...values, isActive: event.target.checked })}
              />
              <span aria-hidden="true" />
            </span>
          </label>
        </fieldset>
      ) : null}
      {localError ? (
        <p className="form-error" role="alert">
          {localError}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Saving…' : record ? 'Save changes' : 'Add staff member'}
        </button>
      </div>
    </form>
  );
}

function ServiceForm({
  record,
  currency,
  categories,
  skills,
  busy,
  onCancel,
  onSubmit,
}: {
  record?: Service;
  currency: string;
  categories: ServiceCategory[];
  skills: Skill[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: ServiceForm) => Promise<boolean>;
}) {
  const [values, setValues] = useState<ServiceForm>({
    name: record?.name ?? '',
    description: record?.description ?? '',
    iconKey: record?.iconKey ?? DEFAULT_SERVICE_ICON_KEY,
    categoryId: record?.categoryId ?? categories[0]?.id ?? '',
    durationMin: String(record?.durationMin ?? 30),
    price: String(record?.price ?? 20),
    skillIds: record?.requiredSkills.map((skill) => skill.id) ?? (skills[0] ? [skills[0].id] : []),
    isActive: record?.isActive ?? true,
  });
  const [localError, setLocalError] = useState('');
  const toggleSkill = (skillId: string) =>
    setValues((current) => ({
      ...current,
      skillIds: current.skillIds.includes(skillId)
        ? current.skillIds.filter((id) => id !== skillId)
        : [...current.skillIds, skillId],
    }));
  return (
    <form
      className="form-grid service-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!values.categoryId) {
          setLocalError('Choose a service category.');
          return;
        }
        if (!values.skillIds.length) {
          setLocalError('Choose at least one required skill.');
          return;
        }
        setLocalError('');
        await onSubmit(values);
      }}
    >
      <div className="service-form-fields">
        <div className="service-form-top-grid">
          <div className="field">
            <label htmlFor="service-name">Service name</label>
            <div className="service-name-control">
              <ServiceIconPicker
                value={values.iconKey}
                onChange={(iconKey) => setValues({ ...values, iconKey })}
              />
              <input
                id="service-name"
                value={values.name}
                onChange={(event) => setValues({ ...values, name: event.target.value })}
                required
                minLength={2}
                maxLength={80}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="service-category">Category</label>
            <select
              id="service-category"
              value={values.categoryId}
              onChange={(event) => setValues({ ...values, categoryId: event.target.value })}
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field service-description-field">
          <div className="field-label-row">
            <label htmlFor="service-description">Service description</label>
            <span aria-hidden="true">{values.description.length}/140</span>
          </div>
          <textarea
            id="service-description"
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
            maxLength={140}
            rows={3}
            placeholder="e.g. A relaxing treatment with a polished finish."
            aria-describedby="service-description-hint"
          />
          <span className="field-hint" id="service-description-hint">
            Optional. Keep it to one short sentence customers can scan on the kiosk.
          </span>
        </div>
        <div className="service-form-details-grid">
          <div className="field">
            <label htmlFor="service-duration">Duration (minutes)</label>
            <input
              id="service-duration"
              type="number"
              min="5"
              max="480"
              step="5"
              value={values.durationMin}
              onChange={(event) => setValues({ ...values, durationMin: event.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="service-price">Price ({currency})</label>
            <input
              id="service-price"
              type="number"
              min="0"
              max="100000"
              step="0.01"
              value={values.price}
              onChange={(event) => setValues({ ...values, price: event.target.value })}
              required
            />
          </div>
          {record ? (
            <div className="field service-visibility-field">
              <label>Visible on kiosk</label>
              <div className="segmented-control" role="group" aria-label="Visible on kiosk">
                <button
                  type="button"
                  className={`segmented-control-choice ${values.isActive ? 'selected' : ''}`}
                  aria-pressed={values.isActive}
                  onClick={() => setValues({ ...values, isActive: true })}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`segmented-control-choice ${!values.isActive ? 'selected' : ''}`}
                  aria-pressed={!values.isActive}
                  onClick={() => setValues({ ...values, isActive: false })}
                >
                  No
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <fieldset className="skill-fieldset service-skill-fieldset">
        <legend>
          <span>Required skills</span>
          <span className="service-skill-count">{values.skillIds.length} selected</span>
        </legend>
        <span className="field-hint">
          Staff must have every selected skill to provide this service.
        </span>
        <div className="checkbox-grid">
          {skills.map((skill) => (
            <label className="checkbox-option" key={skill.id}>
              <input
                type="checkbox"
                checked={values.skillIds.includes(skill.id)}
                onChange={() => toggleSkill(skill.id)}
              />
              <span>{skill.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {localError ? (
        <p className="form-error" role="alert">
          {localError}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Saving…' : record ? 'Save changes' : 'Add service'}
        </button>
      </div>
    </form>
  );
}

function ServiceCategoryForm({
  record,
  busy,
  onCancel,
  onSubmit,
}: {
  record?: ServiceCategory;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: ServiceCategoryForm) => Promise<boolean>;
}) {
  const [values, setValues] = useState<ServiceCategoryForm>({
    name: record?.name ?? '',
    sortOrder: String(record?.sortOrder ?? 0),
    isActive: record?.isActive ?? true,
  });
  return (
    <form
      className="form-grid category-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(values);
      }}
    >
      <div className="category-form-lead">
        <span className="category-form-icon">
          <Layers3 size={19} aria-hidden="true" />
        </span>
        <div>
          <span className="category-form-kicker">Catalog category</span>
          <p>Keep the name short and recognizable on the customer kiosk.</p>
        </div>
      </div>
      <div className="field category-name-field">
        <label htmlFor="service-category-name">Category name</label>
        <input
          id="service-category-name"
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
          required
          minLength={2}
          maxLength={60}
          placeholder="e.g. Manicure"
        />
        <span className="field-hint">
          Use a short English name that customers can scan quickly.
        </span>
      </div>
      <section className="category-settings-panel" aria-labelledby="category-settings-title">
        <div className="category-settings-header">
          <div>
            <h3 id="category-settings-title">Kiosk presentation</h3>
            <p>Choose where this category appears and how customers see it.</p>
          </div>
          {record ? (
            <span
              className={`category-settings-status ${values.isActive ? 'is-visible' : 'is-hidden'}`}
            >
              <span aria-hidden="true" />
              {values.isActive ? 'Visible' : 'Hidden'}
            </span>
          ) : null}
        </div>
        <div className="category-settings-grid">
          <div className="field category-order-field">
            <label htmlFor="service-category-order">Display order</label>
            <input
              id="service-category-order"
              type="number"
              min="0"
              max="999"
              step="1"
              value={values.sortOrder}
              onChange={(event) => setValues({ ...values, sortOrder: event.target.value })}
              required
            />
            <span className="field-hint">Lower numbers appear first.</span>
          </div>
          {record ? (
            <label className={`category-visibility-card ${values.isActive ? 'is-active' : ''}`}>
              <span className="category-visibility-icon">
                <Monitor size={18} aria-hidden="true" />
              </span>
              <span className="category-visibility-copy">
                <strong>Show on customer kiosk</strong>
                <small>Customers can browse this category when booking.</small>
              </span>
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => setValues({ ...values, isActive: event.target.checked })}
                aria-label="Show this category on the customer kiosk"
              />
            </label>
          ) : (
            <div className="category-default-visibility">
              <span className="category-visibility-icon">
                <Monitor size={18} aria-hidden="true" />
              </span>
              <span className="category-visibility-copy">
                <strong>Visible on customer kiosk</strong>
                <small>New categories start visible and can be hidden later.</small>
              </span>
            </div>
          )}
        </div>
      </section>
      <div className="form-actions category-form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Saving…' : record ? 'Save changes' : 'Add category'}
        </button>
      </div>
    </form>
  );
}

function RecordModal({
  title,
  description,
  error,
  wide = false,
  className = '',
  onClose,
  children,
}: {
  title: string;
  description: string;
  error: string;
  wide?: boolean;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useDialogFocus(true, onClose);
  return (
    <div className="modal-backdrop">
      <div
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`.trim()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="record-modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <div className="management-error modal-error" role="alert">
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={28} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <br />
        <span>{description}</span>
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(value),
      )
    : '—';
}

function formatManagementMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

function formatDateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(value),
      )
    : '—';
}

function availabilityPresentation(
  status: Attendance['status'],
  availability: Attendance['availability'],
) {
  if (status !== 'PRESENT') return { label: 'Not available', tone: 'neutral' as const };
  return availability === 'BUSY'
    ? { label: 'Busy', tone: 'blue' as const }
    : { label: 'Available', tone: 'success' as const };
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatStatus(value: CustomerHistoryStatus) {
  return value.replaceAll('_', ' ');
}

function historyStatusTone(
  value: CustomerHistoryStatus,
): 'success' | 'warning' | 'blue' | 'neutral' {
  if (value === 'COMPLETED') return 'success';
  if (value === 'PAYMENT_PENDING') return 'warning';
  if (value === 'IN_SERVICE') return 'blue';
  return 'neutral';
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
