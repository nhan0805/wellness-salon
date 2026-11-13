import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('dashboard report filter stays usable at iPad portrait and landscape sizes', async ({
  page,
}) => {
  await signIn(page, 'ADMIN');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Business overview', exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-report-filter')).toBeVisible();

  for (const viewport of [
    { width: 810, height: 1080 },
    { width: 1080, height: 810 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page.locator('.dashboard-report-filter').evaluate((filter) => {
      const body = filter.querySelector('.dashboard-filter-body');
      const dateInput = filter.querySelector<HTMLInputElement>('.dashboard-filter-date input');
      const bodyStyle = body ? getComputedStyle(body) : null;
      const filterRect = filter.getBoundingClientRect();
      return {
        columnCount: bodyStyle?.gridTemplateColumns.trim().split(/\s+/).length ?? 0,
        dateInputWidth: dateInput?.getBoundingClientRect().width ?? 0,
        filterRight: Math.round(filterRect.right),
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics.columnCount).toBeLessThanOrEqual(2);
    expect(metrics.dateInputWidth).toBeGreaterThan(120);
    expect(metrics.filterRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

    const headerActionRows = await page
      .locator('.admin-topbar .topbar-actions > :not(.admin-live-status)')
      .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(headerActionRows).size).toBe(1);

    if (viewport.width < 1200) {
      await page.getByRole('button', { name: 'Open operations menu' }).click();
      await expect(page.locator('.admin-sidebar .brand-copy')).toHaveCSS('display', 'grid');
      await expect(page.locator('.admin-sidebar .brand-copy small')).toHaveText('Operations');
      await page.locator('.admin-mobile-nav-scrim').click();
    }
  }
});
