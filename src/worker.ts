import vinextWorker from 'vinext/server/fetch-handler';
import { isValidIanaTimezone, scheduledJobForTick } from '@/src/domain/scheduler';

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
