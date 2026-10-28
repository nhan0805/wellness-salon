/**
 * Cloudflare Cron schedules are expressed in UTC and are static Worker
 * configuration. Keep the production schedule next to the timezone decision
 * so a change in the salon timezone cannot silently leave the jobs misaligned.
 */
export const PRODUCTION_TIMEZONE = 'Asia/Ho_Chi_Minh';

// A single quarter-hour trigger lets the Admin UI change ShopConfig.timezone
// or closingTime without requiring a code change or a new deployment. The
// Worker reads the current D1 ShopConfig before deciding which job to run.
export const SCHEDULER_CRON = '*/15 * * * *';

export const PRODUCTION_SCHEDULE = {
  timezone: PRODUCTION_TIMEZONE,
  closingLocalTime: '21:15',
  closingCron: SCHEDULER_CRON,
  retentionLocalTime: '03:15',
  retentionCron: SCHEDULER_CRON,
} as const;

type LocalDateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

function localDateTimeParts(at: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function localTimeParts(at: Date, timeZone: string) {
  const parts = localDateTimeParts(at, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

export function roundedClosingTriggerMinutes(closingTime: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(closingTime);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 1_439) return null;
  return Math.ceil((minutes + 5) / 15) * 15 % 1_440;
}

export type ScheduledJob = 'closing' | 'retention' | null;
export type ScheduledJobs = Array<Exclude<ScheduledJob, null>>;

export function scheduledJobsForTick(at: Date, timeZone: string, closingTime: string): ScheduledJobs {
  if (!isValidIanaTimezone(timeZone)) return [];
  const local = localTimeParts(at, timeZone);
  const localMinutes = local.hour * 60 + local.minute;
  const jobs: ScheduledJobs = [];
  const closingTrigger = roundedClosingTriggerMinutes(closingTime);
  if (closingTrigger !== null && localMinutes === closingTrigger) jobs.push('closing');
  if (localMinutes === 3 * 60 + 15) jobs.push('retention');
  return jobs;
}

export function scheduledJobForTick(at: Date, timeZone: string, closingTime: string): ScheduledJob {
  return scheduledJobsForTick(at, timeZone, closingTime)[0] ?? null;
}

/**
 * Return the business date whose closing should be processed for a closing
 * tick. A closing time near midnight rounds into the next calendar day; the
 * job still belongs to the previous local business date.
 */
export function scheduledClosingBusinessDate(at: Date, timeZone: string, closingTime: string) {
  if (!isValidIanaTimezone(timeZone)) return null;
  const local = localDateTimeParts(at, timeZone);
  const localMinutes = local.hour * 60 + local.minute;
  const closingTrigger = roundedClosingTriggerMinutes(closingTime);
  const closingMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(closingTime);
  if (closingTrigger === null || !closingMatch || localMinutes !== closingTrigger) return null;
  const closingMinutes = Number(closingMatch[1]) * 60 + Number(closingMatch[2]);
  const businessDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (closingTrigger < closingMinutes) businessDate.setUTCDate(businessDate.getUTCDate() - 1);
  return businessDate.toISOString().slice(0, 10);
}

function timezoneOffsetMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return Math.round((localAsUtc - at.getTime()) / 60_000);
}

export function isValidIanaTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a local wall-clock time to a static UTC Cron expression.
 *
 * Static cron triggers cannot represent both sides of a DST transition. For
 * a DST-observing timezone this function refuses to guess; the operator must
 * update the trigger when the offset changes or keep the job behind an
 * external timezone-aware scheduler.
 */
export function staticUtcCronForFixedTimezone(localTime: string, timeZone: string) {
  if (!isValidIanaTimezone(timeZone)) throw new Error(`Invalid IANA timezone: ${timeZone}`);
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) throw new Error(`Invalid local schedule time: ${localTime}`);
  const localHour = Number(match[1]);
  const localMinute = Number(match[2]);
  if (localHour > 23 || localMinute > 59) throw new Error(`Invalid local schedule time: ${localTime}`);

  const sampleDates = [
    new Date('2026-01-15T12:00:00.000Z'),
    new Date('2026-04-15T12:00:00.000Z'),
    new Date('2026-07-15T12:00:00.000Z'),
    new Date('2026-10-15T12:00:00.000Z'),
  ];
  const offsets = new Set(sampleDates.map((date) => timezoneOffsetMinutes(date, timeZone)));
  if (offsets.size !== 1) {
    throw new Error(`Timezone ${timeZone} has seasonal UTC offsets; a static Cron mapping is unsafe`);
  }

  const utcMinute = (localHour * 60 + localMinute - [...offsets][0] + 1_440) % 1_440;
  return `${utcMinute % 60} ${Math.floor(utcMinute / 60)} * * *`;
}
