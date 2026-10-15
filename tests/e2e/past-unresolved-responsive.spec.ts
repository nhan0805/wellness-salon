import { expect, test } from '@playwright/test';
import { openAdminSection, signIn } from './helpers';

const unresolvedPayload = {
  appointments: [
    {
      appointment: {
        id: 'responsive-past-appointment',
        code: 'A901',
        customerName: 'Responsive Guest With A Long Name',
        phone: '+1 415 555 0199',
        serviceId: 'service-basic-manicure',
        serviceName: 'Signature Gel Manicure',
        durationMin: 60,
        amount: 55,
        status: 'ASSIGNED',
        primaryStaffId: 'staff-jenny',
        primaryStaff: { id: 'staff-jenny', name: 'Jenny Nguyen', initials: 'JN' },
        completedAt: null,
        createdAt: '2026-10-10T09:00:00.000Z',
        supportingStaffIds: [],
        payment: null,
        turns: [],
        services: [
          {
            id: 'responsive-past-service',
            serviceId: 'service-basic-manicure',
            sequence: 1,
            serviceName: 'Signature Gel Manicure',
            durationMin: 60,
            amount: 55,
            status: 'ASSIGNED',
            primaryStaff: { id: 'staff-jenny', name: 'Jenny Nguyen', initials: 'JN' },
            turnExclusions: [],
          },
        ],
      },
      businessDate: '2026-10-10',
      daysOverdue: 5,
      resolutionKind: 'ASSIGNMENT_GAP',
      guidance: {
        label: 'Assigned, not started',
        description: 'The visit was assigned but never started.',
        actionLabel: 'Review',
      },
    },
  ],
  currentBusinessDate: '2026-10-15',
  hasMore: false,
  summary: {
    total: 1,
    unserved: 0,
    assignmentGap: 1,
    serviceInterrupted: 0,
    paymentReview: 0,
  },
};

test('past appointment review stays within mobile and tablet viewports', async ({ page }) => {
  await page.route('**/api/admin/appointments/past-unresolved', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(unresolvedPayload),
    }),
  );

  await signIn(page, 'ADMIN');
  await openAdminSection(page, 'Appointments');
  await page
    .getByRole('heading', { name: 'Past appointments needing review', exact: true })
    .waitFor();

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBe(0);
    await expect(page.locator('.past-unresolved-card')).toBeVisible();
    await expect(page.locator('.past-unresolved-table-wrap')).toBeVisible();
    const actionButtons = page.locator('.past-unresolved-actions').first().getByRole('button');
    const actionBoxes = await actionButtons.evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width };
      }),
    );
    expect(actionBoxes).toHaveLength(2);
    expect(Math.abs(actionBoxes[0].top - actionBoxes[1].top)).toBeLessThan(2);
    expect(actionBoxes.every((box) => box.width >= 72)).toBeTruthy();

    const statusMetrics = await page
      .locator('.past-unresolved-table .status-badge')
      .first()
      .evaluate((badge) => ({
        clientWidth: badge.clientWidth,
        scrollWidth: badge.scrollWidth,
      }));
    expect(statusMetrics.scrollWidth).toBeLessThanOrEqual(statusMetrics.clientWidth + 1);

    if (viewport.width === 375) {
      const issueChipMetrics = await page
        .locator('.past-unresolved-kind')
        .first()
        .evaluate((chip) => ({
          chipWidth: chip.getBoundingClientRect().width,
          cellWidth: chip.parentElement?.getBoundingClientRect().width ?? 0,
        }));
      expect(issueChipMetrics.chipWidth).toBeLessThan(issueChipMetrics.cellWidth - 8);
    }
  }
});
