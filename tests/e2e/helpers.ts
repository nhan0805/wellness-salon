import { expect, type Page } from '@playwright/test';

type Role = 'ADMIN' | 'STATION';

export async function signIn(page: Page, role: Role) {
  const email = process.env[`E2E_${role}_EMAIL`] ?? process.env[`${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`] ?? process.env[`${role}_PASSWORD`];
  if (!email || !password) throw new Error(`E2E_${role}_EMAIL and E2E_${role}_PASSWORD are required for database-backed E2E tests`);

  await page.goto(role === 'ADMIN' ? '/admin/sign-in' : '/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(role === 'ADMIN' ? /\/admin$/ : /\/board$/);
}

export async function openAdminSection(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open operations menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

export async function enterPin(page: Page, pin: string) {
  const keypad = page.getByRole('group', { name: /4-digit PIN keypad/ });
  await keypad.focus();
  for (const digit of pin) {
    await keypad.getByRole('button', { name: `Enter ${digit}`, exact: true }).click();
  }
}

export async function confirmStaffAction(page: Page) {
  const confirmButton = page.getByRole('button', { name: /^(Verify & (confirm|continue)|Confirm for .+|Continue as .+)$/ });
  if (await confirmButton.count()) {
    await confirmButton.click();
  }
  await expect(page.getByRole('dialog')).toBeHidden();
}
