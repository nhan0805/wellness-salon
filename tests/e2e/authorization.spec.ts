import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('visitor can view the turn board without signing in', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByRole('heading', { name: "Today’s queue", exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
});

test('board does not expose payment controls', async ({ page }) => {
  await signIn(page, 'STATION');
  await expect(page.getByRole('button', { name: /Payment/i })).not.toBeVisible();
  await expect(page.locator('#current-turn-title')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open customer kiosk in a new tab' })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'Open customer kiosk in a new tab' })).toHaveAttribute('href', '/kiosk');
});

test('admin can open the customer kiosk in a separate tab', async ({ page }) => {
  await signIn(page, 'ADMIN');
  const kioskLink = page.getByRole('link', { name: 'Open customer kiosk in a new tab' });
  await expect(kioskLink).toHaveAttribute('target', '_blank');
  await expect(kioskLink).toHaveAttribute('href', '/kiosk');
});

test('board expands the hidden checked-in staff list into Staff attendance', async ({ page }) => {
  await page.route('**/api/sse/board', (route) => route.abort());
  await page.route('**/api/board**', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      staff: Array<{ isPresent: boolean; availability: string }>;
    };
    payload.staff = payload.staff.map((member) => ({ ...member, isPresent: true, availability: 'AVAILABLE' }));
    await route.fulfill({ response, json: payload });
  });

  await page.goto('/board');
  const moreStaff = page.getByRole('button', { name: 'View 1 more checked-in staff members in Staff attendance' });
  await expect(moreStaff).toBeVisible({ timeout: 10_000 });
  await moreStaff.press('Enter');
  await expect(page.getByRole('tab', { name: /Staff attendance/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.staff-attendance-card')).toHaveCount(6);
});

test('kiosk stays inside the check-in journey', async ({ page }) => {
  await page.goto('/kiosk');
  await expect(page.getByRole('heading', { name: 'Choose your services', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Admin/i })).toHaveCount(0);
});
