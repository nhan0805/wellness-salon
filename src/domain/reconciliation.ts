import type { DailyReport, MonthlyReport, PaymentMethod } from './types';

export function calculateReconciliation(report: Pick<DailyReport | MonthlyReport, 'revenue' | 'cardTotal' | 'cashTotal'>) {
  const recordedTotal = Number((report.cardTotal + report.cashTotal).toFixed(2));
  const difference = Number((report.revenue - recordedTotal).toFixed(2));
  return { recordedTotal, difference, isBalanced: difference === 0 };
}

export function paymentMethodLabel(method: PaymentMethod) {
  return method === 'CARD' ? 'Card' : 'Cash';
}
