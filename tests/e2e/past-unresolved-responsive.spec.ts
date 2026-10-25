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
    {
      appointment: {
        id: 'responsive-payment-appointment',
        code: 'PAY-902',
        customerName: 'Responsive Payment Guest',
        phone: '+1 415 555 0200',
        serviceId: 'service-basic-manicure',
        serviceName: 'Signature Gel Manicure',
        durationMin: 60,
        amount: 55,
        status: 'PAYMENT_PENDING',
        primaryStaffId: 'staff-jenny',
        primaryStaff: { id: 'staff-jenny', name: 'Jenny Nguyen', initials: 'JN' },
        completedAt: null,
        createdAt: '2026-10-10T09:00:00.000Z',
        supportingStaffIds: [],
        payment: null,
        turns: [],
        services: [
          {
            id: 'responsive-payment-service',
            serviceId: 'service-basic-manicure',
            sequence: 1,
            serviceName: 'Signature Gel Manicure',
            durationMin: 60,
            amount: 55,
            status: 'PAYMENT_PENDING',
            primaryStaff: { id: 'staff-jenny', name: 'Jenny Nguyen', initials: 'JN' },
            turnExclusions: [],
          },
        ],
      },
      businessDate: '2026-10-10',
      daysOverdue: 5,
      resolutionKind: 'PAYMENT_REVIEW',
      guidance: {
        label: 'Payment pending',
        description: 'Service finished without a confirmed payment.',
        actionLabel: 'Collect',
      },
    },
  ],
  currentBusinessDate: '2026-10-15',
  hasMore: false,
  summary: {
    total: 2,
    unserved: 0,
    assignmentGap: 1,
    serviceInterrupted: 0,
    paymentReview: 1,
  },
};

test('past appointment actions stay separate across desktop, tablet, and phone viewports', async ({ page }) => {
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
  await expect(page.locator('.past-unresolved-table thead th', { hasText: 'Issue' })).toHaveCount(0);

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate((zoomed) => {
      document.documentElement.style.zoom = zoomed ? '90%' : '';
    }, viewport.width === 1440);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBe(0);
    // CSS zoom is used only for the overflow assertion. Reset it before
    // measuring touch-target dimensions so the checks remain in CSS pixels.
    if (viewport.width === 1440) {
      await page.evaluate(() => {
        document.documentElement.style.zoom = '';
      });
    }
    await expect(page.locator('.past-unresolved-card')).toBeVisible();
    await expect(page.locator('.past-unresolved-table-wrap')).toBeVisible();

    if (viewport.width <= 720) {
      const headerMetrics = await page.locator('.admin-topbar').evaluate((header) => {
        const title = header.querySelector<HTMLElement>('.admin-topbar-title');
        const actions = header.querySelector<HTMLElement>(':scope > .topbar-actions');
        const account = header.querySelector<HTMLElement>(':scope > .account-menu');
        if (!title || !actions || !account) throw new Error('Admin topbar controls did not render');
        const bounds = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2 };
        };
        return {
          header: bounds(header),
          title: bounds(title),
          actions: bounds(actions),
          account: bounds(account),
        };
      });
      expect(Math.abs(headerMetrics.title.center - headerMetrics.actions.center)).toBeLessThan(2);
      expect(Math.abs(headerMetrics.title.center - headerMetrics.account.center)).toBeLessThan(2);
      expect(headerMetrics.actions.top).toBeGreaterThanOrEqual(headerMetrics.header.top - 1);
      expect(headerMetrics.actions.bottom).toBeLessThanOrEqual(headerMetrics.header.bottom + 1);
    }

    const actionGroups = page.locator('.past-unresolved-actions');
    await expect(actionGroups).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const actionBoxes = await actionGroups
        .nth(index)
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const { left, right, top, bottom, width, height } = button.getBoundingClientRect();
            return { left, right, top, bottom, width, height };
          }),
        );
      expect(actionBoxes).toHaveLength(2);
      expect(actionBoxes.every((box) => box.width >= 72 && box.height >= 40)).toBeTruthy();
      const [primaryAction, historyAction] = actionBoxes;
      const overlaps =
        primaryAction.left < historyAction.right &&
        primaryAction.right > historyAction.left &&
        primaryAction.top < historyAction.bottom &&
        primaryAction.bottom > historyAction.top;
      expect(overlaps).toBeFalsy();
      if (viewport.width >= 1101) {
        expect(Math.abs(primaryAction.top - historyAction.top)).toBeLessThan(2);
        expect(Math.abs(primaryAction.width - historyAction.width)).toBeLessThan(2);
      }
    }

    const statusMetrics = await page
      .locator('.past-unresolved-table .status-badge')
      .first()
      .evaluate((badge) => ({
        clientWidth: badge.clientWidth,
        scrollWidth: badge.scrollWidth,
        flexWrap: getComputedStyle(badge).flexWrap,
        whiteSpace: getComputedStyle(badge).whiteSpace,
      }));
    expect(statusMetrics.scrollWidth).toBeLessThanOrEqual(statusMetrics.clientWidth + 1);
    expect(statusMetrics.flexWrap).toBe('nowrap');
    expect(statusMetrics.whiteSpace).toBe('nowrap');

    if (viewport.width <= 560) {
      const ownershipMetrics = await page
        .locator('.past-unresolved-table tbody tr')
        .first()
        .evaluate((row) => {
          const card = row.getBoundingClientRect();
          const assigned = row.querySelector<HTMLElement>("td[data-label='Assigned']");
          const status = row.querySelector<HTMLElement>("td[data-label='Status']");
          const assignedValue = assigned?.querySelector<HTMLElement>('span');
          if (!assigned || !status || !assignedValue) throw new Error('Ownership cells did not render');
          const assignedBox = assigned.getBoundingClientRect();
          const statusBox = status.getBoundingClientRect();
          const styles = getComputedStyle(assignedValue);
          const computedLineHeight = Number.parseFloat(styles.lineHeight);
          const fontSize = Number.parseFloat(styles.fontSize);
          const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : fontSize * 1.2;
          return {
            cardWidth: card.width,
            assignedWidth: assignedBox.width,
            statusWidth: statusBox.width,
            sameColumn: Math.abs(assignedBox.left - statusBox.left) < 1,
            assignedLines: assignedValue.getBoundingClientRect().height / lineHeight,
          };
        });
      expect(ownershipMetrics.assignedWidth).toBeGreaterThan(ownershipMetrics.cardWidth * 0.75);
      expect(ownershipMetrics.statusWidth).toBeGreaterThan(ownershipMetrics.cardWidth * 0.75);
      expect(ownershipMetrics.sameColumn).toBeTruthy();
      expect(ownershipMetrics.assignedLines).toBeLessThan(1.6);
    }

  }

  await page.locator('.past-unresolved-review-button').first().click();
  await expect(page.getByRole('dialog', { name: 'Resolve past appointment' })).toBeVisible();
  const issueSummary = page.getByRole('note', { name: 'Reason this appointment needs review' });
  await expect(issueSummary).toContainText('Assigned, not started');
  await expect(issueSummary).toContainText('The visit was assigned but never started.');
  await page.getByRole('button', { name: 'Close historical resolution' }).click();
});

test('past appointment errors stay actionable when the API returns an empty response', async ({ page }) => {
  await page.route('**/api/admin/appointments/past-unresolved', (route) =>
    route.fulfill({ status: 500, body: '' }),
  );

  await signIn(page, 'ADMIN');
  await openAdminSection(page, 'Appointments');
  await expect(page.locator('.past-unresolved-error')).toContainText(
    'The server returned an empty response.',
  );
  await expect(page.locator('.past-unresolved-error')).not.toContainText(
    'Unexpected end of JSON input',
  );
  await expect(page.locator('.past-unresolved-total')).toHaveText('Unavailable');
  await expect(page.locator('.past-unresolved-empty')).toContainText(
    'Historical review is unavailable',
  );
  await expect(page.locator('.past-unresolved-empty')).not.toContainText(
    'Everything is reconciled',
  );
});
