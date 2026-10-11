import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

async function createKioskVisit(page: import('@playwright/test').Page, name: string) {
  const phone = `+1 415 777 ${String(Date.now()).slice(-7)}`;
  const servicesResponse = await page.request.get('/api/services');
  expect(servicesResponse.ok()).toBeTruthy();
  const servicesPayload = await servicesResponse.json() as { services: Array<{ id: string; name: string }> };
  const service = servicesPayload.services.find((item) => item.name === 'Basic Manicure') ?? servicesPayload.services[0];
  expect(service).toBeTruthy();

  const response = await page.request.post('/api/kiosk/check-in', {
    data: {
      serviceIds: [service!.id],
      phone,
      name,
      idempotencyKey: `appointment-history-${Date.now()}`,
    },
  });
  expect(response.status()).toBe(201);
  const ticket = await response.json() as { code: string };
  expect(ticket.code).toMatch(/^A\d{3}$/);
  return ticket.code;
}

test('admin can view and filter appointment turn history', async ({ page }, testInfo) => {
  await signIn(page, 'ADMIN');
  const code = await createKioskVisit(page, `Turn History Guest ${testInfo.project.name}-${Date.now()}`);

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Appointments', exact: true }).click();

  const row = page.locator('tbody tr').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `View appointment history for ${code}`, exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Appointment history' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(code);
  await expect(dialog.getByText(/event logged?/i)).toBeVisible();

  const timeline = dialog.getByRole('list', { name: 'Appointment events' });
  await expect(timeline).toBeVisible();
  await expect(timeline.locator('li').first()).toBeVisible();

  const eventFilter = dialog.getByLabel('Event', { exact: true });
  const eventOptions = await eventFilter.locator('option').evaluateAll((options) => options.map((option) => option.getAttribute('value') ?? ''));
  expect(eventOptions.length).toBeGreaterThan(1);
  await eventFilter.selectOption(eventOptions[1]);
  await expect(timeline.locator('li').first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Close appointment history', exact: true }).click();
  await expect(dialog).toBeHidden();
});
