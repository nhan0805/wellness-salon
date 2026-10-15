import { expect, test } from '@playwright/test';
import { openAdminSection, signIn } from './helpers';

test('admin attendance loads the staff snapshot without staying on the loading state', async ({
  page,
}) => {
  await signIn(page, 'ADMIN');
  const attendanceResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/attendance') && response.request().method() === 'GET',
  );

  await openAdminSection(page, 'Attendance');

  expect((await attendanceResponse).ok()).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Attendance', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Staff attendance for today' })).toBeVisible();
  await expect(page.getByText('Loading attendance…')).toHaveCount(0);
});
