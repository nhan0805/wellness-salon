import vinextWorker from 'vinext/server/fetch-handler';

// Keep the Worker entrypoint self-contained for the Vinext dev runner. The
// runner loads this module outside the normal app graph and currently cannot
// resolve the TypeScript domain import reliably, while the production bundle
// handles it correctly. These small guards mirror src/domain/scheduler.ts and
// keep scheduled work behind the same timezone/cron checks in both modes.
function localTimeParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(values.hour), minute: Number(values.minute) };
}

function roundedClosingTriggerMinutes(closingTime: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(closingTime);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 1_439) return null;
  return Math.ceil((minutes + 5) / 15) * 15 % 1_440;
}

function isValidIanaTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function localDateTimeParts(at: Date, timeZone: string) {
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

function scheduledJobsForTick(at: Date, timeZone: string, closingTime: string) {
  if (!isValidIanaTimezone(timeZone)) return null;
  const local = localTimeParts(at, timeZone);
  const localMinutes = local.hour * 60 + local.minute;
  const closingTrigger = roundedClosingTriggerMinutes(closingTime);
  const jobs: Array<'closing' | 'retention'> = [];
  if (closingTrigger !== null && localMinutes === closingTrigger) jobs.push('closing');
  if (localMinutes === 3 * 60 + 15) jobs.push('retention');
  return jobs;
}

function scheduledClosingBusinessDate(at: Date, timeZone: string, closingTime: string) {
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

type WorkerEnvironment = Record<string, unknown> & {
  CRON_SECRET?: string;
  SHOP_TIMEZONE?: string;
  PRODUCTION_TIMEZONE_CONFIRMED?: string;
  SCHEDULER_CRON?: string;
  DB?: { prepare(query: string): { first<T = Record<string, unknown>>(): Promise<T | null> } };
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type ScheduledController = {
  cron: string;
  scheduledTime?: number;
};

const schedulerEnabled = (env: WorkerEnvironment) =>
  env.PRODUCTION_TIMEZONE_CONFIRMED === 'true' &&
  typeof env.SCHEDULER_CRON === 'string' &&
  env.SCHEDULER_CRON.length > 0;

async function runInternalJob(path: string, env: WorkerEnvironment, ctx: WorkerExecutionContext, body = '{}') {
  if (!schedulerEnabled(env)) {
    console.warn(JSON.stringify({ level: 'warn', event: 'job.scheduler.disabled', reason: 'scheduler configuration is incomplete or timezone is invalid', path }));
    return;
  }

  const cronSecret = env.CRON_SECRET;
  if (typeof cronSecret !== 'string' || cronSecret.length < 32) {
    throw new Error('CRON_SECRET is not configured for scheduled jobs');
  }

  const response = await vinextWorker.fetch(
    new Request(`https://internal${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body,
    }),
    env,
    ctx,
  );

  if (!response.ok) throw new Error(`Scheduled job ${path} failed with HTTP ${response.status}`);
}

const worker = {
  fetch(request: Request, env: WorkerEnvironment, ctx: WorkerExecutionContext) {
    return vinextWorker.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: WorkerEnvironment, ctx: WorkerExecutionContext) {
    // Cron triggers are UTC, but the Admin UI owns the salon's IANA timezone
    // and closing time in D1. A single quarter-hour trigger lets that UI
    // configuration remain authoritative without a redeploy.
    if (controller.cron !== env.SCHEDULER_CRON) {
      console.warn(JSON.stringify({ level: 'warn', event: 'job.scheduler.unknown_cron', cron: controller.cron }));
      return;
    }
    if (!schedulerEnabled(env)) {
      console.warn(JSON.stringify({ level: 'warn', event: 'job.scheduler.disabled', reason: 'scheduler gate is not enabled' }));
      return;
    }
    const config = await env.DB?.prepare('SELECT timezone, closing_time FROM shop_config WHERE id = 1').first<{ timezone: string; closing_time: string }>();
    const timezone = config?.timezone;
    if (!timezone || !isValidIanaTimezone(timezone)) {
      console.warn(JSON.stringify({ level: 'warn', event: 'job.scheduler.disabled', reason: 'ShopConfig timezone is missing or invalid' }));
      return;
    }
    const scheduledAt = new Date(controller.scheduledTime ?? Date.now());
    const closingTime = config.closing_time ?? '21:00';
    const jobs = scheduledJobsForTick(scheduledAt, timezone, closingTime);
    if (!jobs?.length) return;
    const errors: unknown[] = [];
    // These endpoints both acquire the shop-wide D1 lease. Run them in order
    // so a closing/retention collision does not turn into a false lease-busy
    // failure, while still attempting the next job if one fails.
    for (const job of jobs) {
      try {
        const path = job === 'retention' ? '/api/jobs/retention' : '/api/jobs/closing';
        const businessDate = job === 'closing' ? scheduledClosingBusinessDate(scheduledAt, timezone, closingTime) : null;
        await runInternalJob(path, env, ctx, businessDate ? JSON.stringify({ businessDate }) : '{}');
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw errors[0];
  },
};

export default worker;
