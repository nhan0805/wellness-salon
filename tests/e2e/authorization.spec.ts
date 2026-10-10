import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('visitor can view the turn board without signing in', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByRole('heading', { name: "Today’s turn board", exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
});

test('board does not expose payment controls', async ({ page }) => {
  await signIn(page, 'STATION');
  await expect(page.getByRole('button', { name: /Payment/i })).not.toBeVisible();
  await expect(page.getByText(/Current turn/i)).toBeVisible();
});

test('kiosk stays inside the check-in journey', async ({ page }) => {
  await page.goto('/kiosk');
  await expect(page.getByText(/What are we creating today/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Admin/i })).toHaveCount(0);
});
