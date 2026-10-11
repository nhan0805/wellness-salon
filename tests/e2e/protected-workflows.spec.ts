import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

async function createKioskVisit(page: import('@playwright/test').Page, name: string, serviceName = 'Basic Manicure') {
  const phone = `+1 415 888 ${String(Date.now()).slice(-7)}`;
  await page.goto('/kiosk');
  await page.getByRole('button', { name: new RegExp(serviceName, 'i') }).click();
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByLabel('Mobile number').fill(phone);
  await expect(page.getByText(/New guest — enter your name to continue/i)).toBeVisible();
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
    await page.getByLabel('4-digit PIN').fill('1234');
    await page.getByRole('button', { name: 'Confirm action', exact: true }).click();
  }
  await expect(jenny).toContainText(/Available|Serving a guest/);

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
    await stationPage.getByLabel('4-digit PIN').fill('1234');
    await stationPage.getByRole('button', { name: 'Confirm action', exact: true }).click();
    const currentTurn = stationPage.locator('.current-turn-entry').filter({ hasText: code });
    await expect(currentTurn).toBeVisible();

    const finish = currentTurn.getByRole('button', { name: 'Finish service', exact: true });
    await expect(finish).toBeVisible();
    await finish.click();
    await stationPage.getByLabel('4-digit PIN').fill('1234');
    await stationPage.getByRole('button', { name: 'Confirm action', exact: true }).click();
    await expect(stationPage.getByText('Awaiting admin payment', { exact: true })).toBeVisible();
  } finally {
    await stationPage.close();
  }

  // The station page intentionally shares the browser context in this test;
  // restore the management session before exercising the payment surface.
  await signIn(page, 'ADMIN');
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
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
  await page.getByRole('button', { name: 'Appointments', exact: true }).click();
  const row = page.locator('tbody tr').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cancel appointment', exact: true })).toBeVisible();
  await page.getByLabel('Reason').fill('Customer changed plans before service');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText(`${code} cancelled.`, { exact: true })).toBeVisible();
});
