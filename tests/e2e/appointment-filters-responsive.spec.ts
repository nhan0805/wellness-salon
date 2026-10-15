import { expect, test } from '@playwright/test';
import { openAdminSection, signIn } from './helpers';

const emptyPastPayload = {
  appointments: [],
  currentBusinessDate: '2026-10-15',
  hasMore: false,
  summary: {
    total: 0,
    unserved: 0,
    assignmentGap: 0,
    serviceInterrupted: 0,
    paymentReview: 0,
  },
};

const emptyAppointmentsPayload = {
  appointments: [],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  summary: { totalRevenue: 0, totalDuration: 0 },
  filterOptions: { staff: [], services: [] },
};

test('appointment filters keep a balanced mobile layout', async ({ page }) => {
  await page.route('**/api/admin/appointments/past-unresolved', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyPastPayload),
    }),
  );
  await page.route('**/api/admin/appointments?*', (route) =>
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyAppointmentsPayload),
      });
    })(),
  );

  await signIn(page, 'ADMIN');
  await openAdminSection(page, 'Appointments');
  await expect(page.getByLabel('Search', { exact: true })).toBeVisible();
  await expect(page.locator('.appointment-date-loading')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });

  const filterMetrics = await page
    .locator('.appointment-filter-grid')
    .first()
    .evaluate((grid) => {
      const panel = grid.closest('.appointment-filter-panel');
      const loading = document.querySelector('.appointment-date-loading');
      const gridStyle = getComputedStyle(grid);
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const loadingStyle = loading ? getComputedStyle(loading) : null;
      return {
        columnCount: gridStyle.gridTemplateColumns.trim().split(/\s+/).length,
        panelBackground: panelStyle?.backgroundColor ?? '',
        loadingFlexBasis: loadingStyle?.flexBasis ?? '',
      };
    });

  expect(filterMetrics.columnCount).toBe(1);
  expect(filterMetrics.panelBackground).toBe('rgba(0, 0, 0, 0)');
  expect(filterMetrics.loadingFlexBasis).toBe('100%');
});
