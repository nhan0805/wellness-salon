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

function scheduledJobForTick(at: Date, timeZone: string, closingTime: string) {
  if (!isValidIanaTimezone(timeZone)) return null;
  const local = localTimeParts(at, timeZone);
  const localMinutes = local.hour * 60 + local.minute;
  const closingTrigger = roundedClosingTriggerMinutes(closingTime);
  if (closingTrigger !== null && localMinutes === closingTrigger) return 'closing' as const;
  if (localMinutes === 3 * 60 + 15) return 'retention' as const;
  return null;
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

async function runInternalJob(path: string, env: WorkerEnvironment, ctx: WorkerExecutionContext) {
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
      body: '{}',
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
    const job = scheduledJobForTick(scheduledAt, timezone, config.closing_time ?? '21:00');
    const path = job === 'retention' ? '/api/jobs/retention' : job === 'closing' ? '/api/jobs/closing' : null;
    if (!path) return;
    await runInternalJob(path, env, ctx);
  },
};

export default worker;
