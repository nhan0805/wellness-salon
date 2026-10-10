import { describe, expect, it } from 'vitest';
import { calculateReconciliation } from '@/src/domain/reconciliation';

describe('payment reconciliation', () => {
  it('reports a zero difference when card plus cash equals system revenue', () => {
    expect(calculateReconciliation({ revenue: 1280, cardTotal: 820, cashTotal: 460 })).toEqual({ recordedTotal: 1280, difference: 0, isBalanced: true });
  });

  it('flags an unresolved difference', () => {
    expect(calculateReconciliation({ revenue: 100, cardTotal: 70, cashTotal: 20 })).toEqual({ recordedTotal: 90, difference: 10, isBalanced: false });
  });
});
