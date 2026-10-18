import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 366, height: 267 },
  { name: 'portrait', width: 810, height: 1080 },
  { name: 'landscape', width: 1080, height: 810 },
] as const;

async function installQueueFixture(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.querySelector('#queue-responsive-fixture')?.remove();

    const fixture = document.createElement('div');
    fixture.id = 'queue-responsive-fixture';
    fixture.className = 'board-shell';
    fixture.innerHTML = `
      <main class="board-main">
        <div class="board-grid">
          <section class="card current-turn" aria-hidden="true"></section>
          <div class="board-side has-up-next">
            <section class="card card-pad">
              <div class="queue-list">
                <div class="queue-item">
                  <div class="queue-number">PERF-2026-06779</div>
                  <div class="queue-item-body">
                    <strong>Nhan</strong>
                    <div class="queue-service-list">
                      <div class="queue-service-row is-next">
                        <span class="queue-service-status">Next</span>
                        <span class="queue-service-name">1. Gel Manicure</span>
                      </div>
                    </div>
                    <small class="queue-service-meta">1 services · 60 min total</small>
                  </div>
                  <div class="queue-assignee">
                    <span class="queue-assignee-label">Assigned staff</span>
                    <span class="queue-assignee-name"><span class="avatar">AN</span><span class="queue-assignee-name-text">Anna</span></span>
                  </div>
                  <div class="queue-actions">
                    <div class="queue-service-action">
                      <span class="queue-service-action-label"><small>Next service</small><strong>Gel Manicure</strong></span>
                      <button class="button button-primary button-sm queue-action">Accept</button>
                      <button class="button button-outline button-sm queue-action queue-skip-action">Skip</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section class="card card-pad" aria-hidden="true"></section>
          </div>
        </div>
      </main>`;
    document.body.append(fixture);
  });
}

test('queue cards keep service labels readable on iPad portrait and landscape', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', 'This regression is scoped to the tablet project.');

  await page.goto('/board');
  await expect(page.getByRole('heading', { name: "Today’s queue", exact: true })).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installQueueFixture(page);

    const metrics = await page.locator('#queue-responsive-fixture').evaluate((root) => {
      const side = root.querySelector<HTMLElement>('.board-side');
      const item = root.querySelector<HTMLElement>('.queue-item');
      const number = root.querySelector<HTMLElement>('.queue-number');
      const serviceRow = root.querySelector<HTMLElement>('.queue-service-row.is-next');
      const serviceName = root.querySelector<HTMLElement>('.queue-service-name');
      const action = root.querySelector<HTMLElement>('.queue-service-action');
      const buttons = [...root.querySelectorAll<HTMLElement>('.queue-action')];
      if (!side || !item || !number || !serviceRow || !serviceName || !action) throw new Error('Queue fixture did not render');

      const rect = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, height: bounds.height };
      };
      const codeRange = document.createRange();
      codeRange.selectNodeContents(number);
      const codeRects = [...codeRange.getClientRects()];
      const sideColumns = getComputedStyle(side).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
      const rowColumns = getComputedStyle(serviceRow).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
      const parsedLineHeight = Number.parseFloat(getComputedStyle(serviceName).lineHeight);
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : serviceName.getBoundingClientRect().height;

      return {
        viewportWidth: window.innerWidth,
        sideColumns: sideColumns.length,
        rowColumns: rowColumns.length,
        item: rect(item),
        number: rect(number),
        numberBackground: getComputedStyle(number).backgroundColor,
        codeBottom: Math.max(...codeRects.map((bounds) => bounds.bottom)),
        serviceName: rect(serviceName),
        serviceLineHeight: lineHeight,
        action: rect(action),
        buttons: buttons.map(rect),
      };
    });

    expect(metrics.item.left).toBeGreaterThanOrEqual(0);
    expect(metrics.item.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.sideColumns, `${viewport.name} side rail should stay one column`).toBe(1);
    expect(metrics.serviceName.height, `${viewport.name} service name should not wrap per character`).toBeLessThanOrEqual(metrics.serviceLineHeight * 1.5);
    expect(metrics.buttons.every((button) => button.left >= metrics.action.left - 1 && button.right <= metrics.action.right + 1)).toBeTruthy();
    expect(metrics.numberBackground, `${viewport.name} queue code should keep its peach background`).toBe('rgb(255, 240, 232)');
    expect(metrics.codeBottom, `${viewport.name} queue code should stay inside its background`).toBeLessThanOrEqual(metrics.number.bottom + 1);

    if (viewport.name === 'landscape') {
      expect(metrics.rowColumns, 'landscape active service row should stack its label and name').toBe(1);
    }
  }
});
