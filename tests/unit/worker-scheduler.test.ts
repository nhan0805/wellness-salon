import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('vinext/server/fetch-handler', () => ({
  default: { fetch: fetchMock },
}));

const { default: worker } = await import('@/src/worker');

const schedulerCron = '*/15 * * * *';

function environment(overrides: Record<string, unknown> = {}) {
  const timezone = typeof overrides.SHOP_TIMEZONE === 'string' ? overrides.SHOP_TIMEZONE : 'Asia/Ho_Chi_Minh';
  const db = {
    prepare: vi.fn(() => ({
      first: vi.fn(async () => ({ timezone, closing_time: '21:00' })),
    })),
  };
  return {
    CRON_SECRET: 'c'.repeat(40),
    SHOP_TIMEZONE: 'Asia/Ho_Chi_Minh',
    PRODUCTION_TIMEZONE_CONFIRMED: 'true',
    SCHEDULER_CRON: schedulerCron,
    DB: db,
    ...overrides,
  };
}

function context() {
  return { waitUntil: vi.fn() };
}

describe('Worker scheduled handler', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('keeps scheduled jobs inert until the scheduler gate is complete', async () => {
    await worker.scheduled({ cron: schedulerCron }, environment({ PRODUCTION_TIMEZONE_CONFIRMED: 'false' }) as never, context());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes the configured quarter-hour events to protected endpoints using the D1 timezone', async () => {
    const closingContext = context();
    await worker.scheduled({ cron: schedulerCron, scheduledTime: Date.parse('2026-10-12T14:15:00.000Z') }, environment() as never, closingContext);
    await worker.scheduled({ cron: schedulerCron, scheduledTime: Date.parse('2026-10-12T20:15:00.000Z') }, environment() as never, context());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequest = fetchMock.mock.calls[0]?.[0] as Request;
    const secondRequest = fetchMock.mock.calls[1]?.[0] as Request;
    expect(firstRequest.url).toBe('https://internal/api/jobs/closing');
    expect(secondRequest.url).toBe('https://internal/api/jobs/retention');
    expect(firstRequest.headers.get('x-cron-secret')).toBe('c'.repeat(40));
    expect(firstRequest.method).toBe('POST');
    expect(closingContext.waitUntil).not.toHaveBeenCalled();
  });

  it('ignores an unknown cron event and refuses an incomplete secure configuration', async () => {
    await worker.scheduled({ cron: '0 0 * * *' }, environment() as never, context());
    await worker.scheduled({ cron: schedulerCron, scheduledTime: Date.parse('2026-10-12T14:15:00.000Z') }, environment({ SHOP_TIMEZONE: 'Not/A_Timezone' }) as never, context());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the scheduler secret is missing', async () => {
    await expect(worker.scheduled({ cron: schedulerCron, scheduledTime: Date.parse('2026-10-12T14:15:00.000Z') }, environment({ CRON_SECRET: undefined }) as never, context())).rejects.toThrow(/CRON_SECRET/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
