export type MoneyLike = number | string | { toString(): string };

function normalizedMoneyText(value: MoneyLike) {
  const text = String(value).trim();
  if (!text || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) throw new Error('Money must be a finite decimal amount');
  return text;
}

export function toMinorUnits(value: MoneyLike) {
  const text = normalizedMoneyText(value);
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) throw new Error('Money must use at most two decimal places');
  const cents = Number(`${whole || '0'}${fraction.padEnd(2, '0').slice(0, 2)}`);
  if (!Number.isSafeInteger(cents)) throw new Error('Money amount is too large');
  return negative ? -cents : cents;
}

export function moneyFromMinorUnits(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error('Money minor units must be a safe integer');
  return value / 100;
}

export function sumMoney(values: MoneyLike[]) {
  return moneyFromMinorUnits(values.reduce<number>((total, value) => total + toMinorUnits(value), 0));
}

export function equalMoney(left: MoneyLike, right: MoneyLike) {
  return toMinorUnits(left) === toMinorUnits(right);
}
