import { expect, test } from '@playwright/test';
import { openAdminSection, signIn } from './helpers';

test('admin can add, edit, and delete a customer without appointment history', async ({ page }, testInfo) => {
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const name = `Smoke Guest ${marker}`;
  const updatedName = `Updated Guest ${marker}`;
  const phone = `+1 415 555 ${String(Date.now()).slice(-4)}`;

  await signIn(page, 'ADMIN');
  await openAdminSection(page, 'Customers');
  await expect(page.getByRole('heading', { name: 'Customers', exact: true, level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Add customer', exact: true }).first().click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('dialog').getByRole('button', { name: 'Add customer', exact: true }).click();

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

test('staff form keeps the name field compact and persists skills and assignment availability', async ({ page }, testInfo) => {
  await signIn(page, 'ADMIN');
  const staffPayload = (await (await page.request.get('/api/admin/staff')).json()) as {
    skills?: Array<{ id: string }>;
  };
  const skillId = staffPayload.skills?.[0]?.id;
  expect(skillId).toBeTruthy();

  const marker = `Form Staff ${testInfo.project.name}-${Date.now()}`;
  const createResponse = await page.request.post('/api/admin/staff', {
    headers: { Origin: 'http://127.0.0.1:3001' },
    data: { name: marker, pin: '1357', skillIds: [skillId] },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = (await createResponse.json()) as { staff?: { id?: string } };
  const staffId = created.staff?.id;
  expect(staffId).toBeTruthy();

  try {
    await page.goto('/admin');
    await openAdminSection(page, 'Settings');
    await page.getByRole('button', { name: 'Staff', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Staff', exact: true, level: 2 })).toBeVisible();

    const row = page.locator('tbody tr').filter({ hasText: marker });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const nameInput = page.getByLabel('Full name');
    await expect(nameInput).toHaveAttribute('type', 'text');
    await expect(nameInput).toHaveCount(1);
    expect(await nameInput.evaluate((input) => input.getBoundingClientRect().height)).toBeLessThan(80);
    await expect(page.locator('textarea#staff-name')).toHaveCount(0);
    await expect(page.locator('.skill-fieldset')).not.toContainText('Available for new assignments');

    const availability = page.getByRole('switch', { name: /Available for new assignments/i });
    const initialAvailability = await availability.isChecked();
    await availability.click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Staff member updated.', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('switch', { name: /Available for new assignments/i })).toBeChecked({ checked: !initialAvailability });
    await page.getByRole('switch', { name: /Available for new assignments/i }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Staff member updated.', { exact: true })).toBeVisible();
  } finally {
    const deleteResponse = await page.request.delete(`/api/admin/staff?id=${encodeURIComponent(staffId ?? '')}`, {
      headers: { Origin: 'http://127.0.0.1:3001' },
    });
    expect(deleteResponse.ok()).toBeTruthy();
  }
});
