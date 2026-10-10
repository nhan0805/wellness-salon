import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('admin can add, edit, and delete a customer without appointment history', async ({ page }, testInfo) => {
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const name = `Smoke Guest ${marker}`;
  const updatedName = `Updated Guest ${marker}`;
  const phone = `+1 415 555 ${String(Date.now()).slice(-4)}`;

  await signIn(page, 'ADMIN');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true, level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Add record', exact: true }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();

  const row = page.locator('tbody tr').filter({ hasText: name });
  await expect(row).toContainText(phone);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Full name').fill(updatedName);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('tbody tr').filter({ hasText: updatedName })).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await page.locator('tbody tr').filter({ hasText: updatedName }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('tbody tr').filter({ hasText: updatedName })).toHaveCount(0);
});
