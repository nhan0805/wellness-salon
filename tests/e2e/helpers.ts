import { expect, type Page } from '@playwright/test';

type Role = 'ADMIN' | 'STATION';

export async function signIn(page: Page, role: Role) {
  const email = process.env[`E2E_${role}_EMAIL`] ?? process.env[`${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`] ?? process.env[`${role}_PASSWORD`];
  if (!email || !password) throw new Error(`E2E_${role}_EMAIL and E2E_${role}_PASSWORD are required for database-backed E2E tests`);

  await page.goto(role === 'ADMIN' ? '/admin/sign-in' : '/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(role === 'ADMIN' ? /\/admin$/ : /\/board$/);
}
