import { describe, expect, it } from 'vitest';
import { equalMoney, moneyFromMinorUnits, sumMoney, toMinorUnits } from '@/src/domain/money';

describe('exact money arithmetic', () => {
  it('represents decimal values as integer minor units', () => {
    expect(toMinorUnits('19.95')).toBe(1995);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(moneyFromMinorUnits(205)).toBe(2.05);
    expect(equalMoney('10.00', 10)).toBe(true);
  });

  it('rejects values with non-zero fractions below one cent', () => {
    expect(() => toMinorUnits('10.005')).toThrow('two decimal places');
  });
});
