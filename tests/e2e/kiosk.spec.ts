import { expect, test } from '@playwright/test';

test('customer can check in from the kiosk', async ({ page }) => {
  const phone = `+1 415 555 ${Date.now().toString().slice(-4)}`;
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Basic Manicure/i }).click();
  await page.getByRole('button', { name: /Continue/i }).click({ force: true });
  await page.getByLabel('Mobile number').fill(phone);
  await expect(page.getByText(/Number looks good — enter your name to continue/i)).toBeVisible();
  await page.getByLabel('First and last name').fill('Taylor Morgan');
  await page.getByRole('button', { name: /Check in/i }).click();
  await expect(page.getByRole('heading', { name: /^A\d{3}$/ })).toBeVisible();
  await expect(page.getByText(/Assigned to|Waiting for a specialist/)).toBeVisible();
});

test('returning guest cannot use the kiosk to discover saved profile details', async ({ page }) => {
  const phone = `+1 415 556 ${Date.now().toString().slice(-4)}`;
  const savedName = 'Returning Guest';
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Basic Manicure/i }).click();
  await page.getByRole('button', { name: /Continue/i }).click({ force: true });
  await page.getByLabel('Mobile number').fill(phone);
  await expect(page.getByText(/Number looks good — enter your name to continue/i)).toBeVisible();
  await page.getByLabel('First and last name').fill(savedName);
  await page.getByRole('button', { name: /Check in/i }).click();
  await expect(page.getByRole('heading', { name: /^A\d{3}$/ })).toBeVisible();

  await page.getByRole('button', { name: /New check-in/i }).click();
  await page.getByRole('button', { name: /Basic Manicure/i }).click();
  await page.getByRole('button', { name: /Continue/i }).click({ force: true });
  await page.getByLabel('Mobile number').fill(phone);
  await expect(page.getByText(/Number looks good — enter your name to continue/i)).toBeVisible();
  const nameInput = page.getByLabel('First and last name');
  await expect(nameInput).toBeEditable();
  await expect(page.getByText(/Welcome back — we found your details/i)).toHaveCount(0);
  await expect(page.getByText(savedName, { exact: true })).toHaveCount(0);
});
