import { expect, test } from '@playwright/test';

test('customer can join the turn board from the kiosk', async ({ page }) => {
  const phone = `+1 415 555 ${Date.now().toString().slice(-4)}`;
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Basic Manicure/i }).click();
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByLabel('Mobile number').fill(phone);
  await expect(page.getByText(/New guest — enter your name to continue/i)).toBeVisible();
  await page.getByLabel('First and last name').fill('Taylor Morgan');
  await page.getByRole('button', { name: /Join the turn board/i }).click();
  await expect(page.getByRole('heading', { name: /^A\d{3}$/ })).toBeVisible();
  await expect(page.getByText(/Assigned to|Waiting for an eligible specialist/)).toBeVisible();
});
