import { expect, test } from '@playwright/test';
import { confirmStaffAction, enterPin, openAdminSection, signIn } from './helpers';

async function clearUnfinishedE2EVisits(page: import('@playwright/test').Page) {
  const response = await page.request.get('/api/admin/appointments');
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    appointments: Array<{ id: string; code: string; status: string }>;
  };
  const cancellableStatuses = new Set(['CREATED', 'WAITING', 'ASSIGNED']);
  for (const appointment of payload.appointments) {
    if (!/^A\d{3}$/.test(appointment.code) || !cancellableStatuses.has(appointment.status))
      continue;
    const cancelResponse = await page.request.post('/api/admin/appointments/cancel', {
      headers: { Origin: 'http://127.0.0.1:3001' },
      data: {
        appointmentId: appointment.id,
        scope: 'VISIT',
        reason: 'Reset unfinished E2E fixture',
        confirmed: true,
        idempotencyKey: `e2e-reset-${appointment.id}`,
      },
    });
    expect(cancelResponse.ok()).toBeTruthy();
  }
}

async function createKioskVisit(
  page: import('@playwright/test').Page,
  name: string,
  serviceName = 'Basic Manicure',
) {
  const phone = `+1 415 888 ${String(Date.now()).slice(-7)}`;
  await page.goto('/kiosk');
  const serviceHeading = page
    .locator('h3')
    .filter({
      hasText: new RegExp(`^${serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
  await page.locator('button.service-card').filter({ has: serviceHeading }).click();
  await page.getByRole('button', { name: /Continue/i }).click({ force: true });
  await page.getByLabel('Mobile number').fill(phone);
  await expect(page.getByText(/Number looks good — enter your name to continue/i)).toBeVisible();
  await page.getByLabel('First and last name').fill(name);
  await page.getByRole('button', { name: /Check in/i }).click();
  const ticket = page.getByRole('heading', { name: /^A\d{3}$/ });
  await expect(ticket).toBeVisible();
  return (await ticket.textContent()) ?? '';
}

test('protected tablet workflow completes a turn and payment', async ({ page }) => {
  await signIn(page, 'ADMIN');
  await page.goto('/board');
  await page.getByRole('tab', { name: /Staff attendance/i }).click();
  const jenny = page.locator('article.staff-attendance-card').filter({ hasText: 'Jenny' });
  const attendanceButton = jenny.getByRole('button', { name: /Check in|Check out/ });
  if ((await attendanceButton.textContent())?.includes('Check in')) {
    await attendanceButton.click();
    await enterPin(page, '1234');
    await confirmStaffAction(page);
  }
  await expect(jenny).toContainText(/Available|Serving a guest/);

  await clearUnfinishedE2EVisits(page);
  const code = await createKioskVisit(page, 'Protected Workflow Guest', 'Nail Art');
  const stationPage = await page.context().newPage();
  try {
    await signIn(stationPage, 'STATION');
    await stationPage.goto('/board');
    const queueItem = stationPage.locator('.queue-item').filter({ hasText: code });
    await expect(queueItem).toBeVisible();
    const accept = queueItem.getByRole('button', { name: 'Accept Nail Art', exact: true });
    await expect(accept).toBeVisible();
    await accept.click();
    await enterPin(stationPage, '1234');
    await confirmStaffAction(stationPage);
    const currentTurn = stationPage.locator('.current-turn-entry').filter({ hasText: code });
    await expect(currentTurn).toBeVisible();

    const finish = currentTurn.getByRole('button', { name: 'Finish service', exact: true });
    await expect(finish).toBeVisible();
    await finish.click();
    await enterPin(stationPage, '1234');
    await confirmStaffAction(stationPage);
    await expect(currentTurn.getByText('Awaiting payment', { exact: true })).toBeVisible();
  } finally {
    await stationPage.close();
  }

  // The station page intentionally shares the browser context in this test;
  // restore the management session before exercising the payment surface.
  await signIn(page, 'ADMIN');
  await page.goto('/admin');
  await openAdminSection(page, 'Payments');
  const paymentRow = page.locator('tbody tr').filter({ hasText: code });
  await expect(paymentRow).toBeVisible();
  await paymentRow.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Confirm payment', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm & complete', exact: true }).click();
  await expect(page.getByText(`${code} marked paid via card.`, { exact: true })).toBeVisible();
});

test('management tablet cancels a selected service with an audit reason', async ({ page }) => {
  await signIn(page, 'ADMIN');
  const code = await createKioskVisit(page, 'Cancellation Workflow Guest');
  await page.goto('/admin');
  await openAdminSection(page, 'Appointments');
  const row = page.locator('tbody tr').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row
    .getByRole('button', { name: `Open actions for appointment ${code}`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Cancel appointment', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Cancel appointment', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Reason').fill('Customer changed plans before service');
  await page.getByRole('button', { name: 'Cancel appointment', exact: true }).click();
  await expect(page.getByText(`${code} cancelled.`, { exact: true })).toBeVisible();
});
