import { expect, test } from '@playwright/test';

test('editing a populated email keeps focus on email in the login form', async ({ page }) => {
  await page.goto('/sign-in');

  const email = page.locator('#sign-in-email');
  const password = page.locator('#sign-in-password');
  await expect(email).toBeVisible();

  await email.fill('old@example.test');
  await password.fill('fake-password-123');
  await email.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('new@example.test');

  await expect(email).toHaveValue('new@example.test');
  await expect(email).toBeFocused();
  await expect(password).not.toBeFocused();
});
