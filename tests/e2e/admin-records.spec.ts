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
    skills?: Array<{ id: string; name: string }>;
  };
  const selectedSkill = staffPayload.skills?.[0];
  expect(selectedSkill).toBeTruthy();
  if (!selectedSkill) throw new Error('The test database has no staff skills.');
  const { id: skillId, name: skillName } = selectedSkill;

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
    await page.setViewportSize(
      testInfo.project.name === 'tablet' ? { width: 768, height: 1024 } : { width: 1280, height: 800 },
    );
    await page.goto('/admin');
    await openAdminSection(page, 'Settings');
    await page.getByRole('button', { name: 'Staff', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Staff', exact: true, level: 2 })).toBeVisible();

    if (testInfo.project.name !== 'tablet') {
      await page.setViewportSize({ width: 375, height: 812 });
    }

    const row = page.locator('tbody tr').filter({ hasText: marker });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const nameInput = page.getByLabel('Full name');
    await expect(nameInput).toHaveValue(marker);
    await expect(nameInput).toHaveAttribute('type', 'text');
    await expect(nameInput).toHaveCount(1);
    expect(await nameInput.evaluate((input) => input.getBoundingClientRect().height)).toBeLessThan(80);
    await expect(page.locator('textarea#staff-name')).toHaveCount(0);
    await expect(page.locator('.skill-fieldset')).not.toContainText('Available for new assignments');
    await expect(page.getByRole('checkbox', { name: skillName })).toBeChecked();

    const formLayout = await page.getByRole('dialog').evaluate((dialog) => {
      const name = dialog.querySelector<HTMLElement>('#staff-name')?.getBoundingClientRect();
      const pin = dialog.querySelector<HTMLElement>('.pin-keypad')?.getBoundingClientRect();
      const root = document.documentElement;
      return {
        nameRight: name?.right ?? 0,
        nameBottom: name?.bottom ?? 0,
        pinLeft: pin?.left ?? 0,
        pinTop: pin?.top ?? 0,
        documentOverflow: root.scrollWidth - root.clientWidth,
      };
    });
    expect(formLayout.documentOverflow).toBe(0);
    expect(
      formLayout.nameRight <= formLayout.pinLeft || formLayout.nameBottom <= formLayout.pinTop,
    ).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();

    const availability = page.getByRole('switch', { name: /Available for new assignments/i });
    const initialAvailability = await availability.isChecked();
    await availability.click();
    const firstStaffRefresh = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/staff') &&
        response.request().method() === 'GET' &&
        response.ok(),
    );
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await firstStaffRefresh;
    await expect(page.getByText('Staff member updated.', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('switch', { name: /Available for new assignments/i })).toBeChecked({ checked: !initialAvailability });
  } finally {
    const deleteResponse = await page.request.delete(`/api/admin/staff?id=${encodeURIComponent(staffId ?? '')}`, {
      headers: { Origin: 'http://127.0.0.1:3001' },
      timeout: 5_000,
    });
    expect(deleteResponse.ok()).toBeTruthy();
  }
});
