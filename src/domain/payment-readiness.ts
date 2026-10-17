/**
 * A payment can only be collected after every service in the visit has a
 * terminal outcome and at least one service was actually completed by a
 * specialist. Keeping this rule in the domain layer lets the API and the
 * admin UI agree about legacy/incomplete records.
 */
export type PaymentReadinessService = {
  status: string;
  primaryStaffId?: string | null;
  completedAt?: Date | string | null;
};

export function isAppointmentPaymentReady(input: {
  status: string;
  services: readonly PaymentReadinessService[];
}) {
  if (input.status !== 'PAYMENT_PENDING' || input.services.length === 0) return false;

  const payableServices = input.services.filter((service) => service.status === 'COMPLETED');
  const hasUnfinishedServices = input.services.some(
    (service) => service.status !== 'COMPLETED' && service.status !== 'CANCELLED',
  );

  return (
    payableServices.length > 0 &&
    !hasUnfinishedServices &&
    payableServices.every(
      (service) => Boolean(service.primaryStaffId) && Boolean(service.completedAt),
    )
  );
}
