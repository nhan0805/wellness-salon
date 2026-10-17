import { expect, test } from '@playwright/test';

test('public board reports a transient SSE disconnect and returns to polling sync', async ({ page }) => {
  let sseAttempts = 0;
  await page.route('**/api/sse/board', async (route) => {
    sseAttempts += 1;
    if (sseAttempts === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/board');
  await expect(page.getByRole('heading', { name: "Today’s queue", exact: true })).toBeVisible();
  await expect.poll(() => sseAttempts, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.board-last-updated')).toContainText('Syncing', { timeout: 10_000 });
});

test('tablet browser recovers after an emulated board-network interruption', async ({ page }) => {
  let networkDown = true;
  await page.route('**/api/board', async (route) => {
    if (networkDown) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });
  await page.route('**/api/sse/board', async (route) => {
    if (networkDown) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });

  await page.goto('/board');
  await expect(page.getByRole('heading', { name: "Today’s queue", exact: true })).toBeVisible();
  const boardError = page.locator('.management-error');
  await expect(boardError).toContainText('Failed to fetch', { timeout: 10_000 });

  networkDown = false;
  await boardError.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.board-last-updated')).toContainText('Syncing', { timeout: 15_000 });
});

test('repeated kiosk submissions with one idempotency key return one visit', async ({ page }) => {
  await page.goto('/kiosk');
  const serviceResponse = await page.request.get('/api/services');
  expect(serviceResponse.ok()).toBeTruthy();
  const servicePayload = await serviceResponse.json() as { services: Array<{ id: string; name: string }> };
  const service = servicePayload.services.find((item) => item.name === 'Basic Manicure') ?? servicePayload.services[0];
  expect(service).toBeTruthy();
  const phone = `+1 415 666 ${String(Date.now()).slice(-7)}`;
  const body = { serviceIds: [service.id], phone, name: 'Retry Safety Guest', idempotencyKey: `resilience-${Date.now()}` };
  const responses = await Promise.all([
    page.request.post('/api/kiosk/check-in', { data: body, headers: { Origin: 'http://127.0.0.1:3001' } }),
    page.request.post('/api/kiosk/check-in', { data: body, headers: { Origin: 'http://127.0.0.1:3001' } }),
  ]);
  expect(responses.every((response) => response.status() === 201)).toBeTruthy();
  const payloads = await Promise.all(responses.map((response) => response.json() as Promise<{ appointmentId: string }>));
  expect(payloads[0].appointmentId).toBe(payloads[1].appointmentId);
});
