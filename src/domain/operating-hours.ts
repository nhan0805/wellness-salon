export type OperatingHours = {
  timezone: string;
  openingTime: string;
  closingTime: string;
};

export function minutesInTimezone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function configuredTimeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

export function isWithinOperatingHours(now: Date, config: OperatingHours) {
  const openingMinutes = configuredTimeToMinutes(config.openingTime);
  const closingMinutes = configuredTimeToMinutes(config.closingTime);
  if (openingMinutes === null || closingMinutes === null || openingMinutes >= closingMinutes)
    return false;
  const currentMinutes = minutesInTimezone(now, config.timezone);
  return currentMinutes >= openingMinutes && currentMinutes < closingMinutes;
}
