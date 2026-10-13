import { expect, test } from '@playwright/test';

async function rects(page: import('@playwright/test').Page, target: string) {
  return page.evaluate((sel) => {
    const visible = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getBoundingClientRect().width > 0)!;
    const t = visible.getBoundingClientRect();
    const s = document.querySelector('[data-testid="tour-spot"]')!.getBoundingClientRect();
    const a = document.querySelector('[data-testid="tour-arrow"]')!.getBoundingClientRect();
    const c = document.querySelector('[data-testid="tour-card"]')!.getBoundingClientRect();
    return { t: { x: t.x, y: t.y, w: t.width, h: t.height }, s: { x: s.x, y: s.y, w: s.width, h: s.height }, a: { x: a.x + a.width / 2, top: a.top, bottom: a.bottom }, c: { top: c.top, bottom: c.bottom, left: c.left, right: c.right }, vw: innerWidth, vh: innerHeight };
  }, target);
}

test('mission tutorial follows real controls, repositions, and advances on action', async ({ page }) => {
  await page.goto('/#/help');
  await page.getByTestId('start-tour-mission').click();
  await expect(page.getByTestId('tour-card')).toContainText('Step 1 of 9');
  await expect(page.getByTestId('tour-spot')).toBeVisible();
  await page.waitForTimeout(400);
  let r = await rects(page, '[data-tour="inspection-bar"]');
  // Spotlight surrounds the target; arrow is horizontally on the target; card is on-screen and not over the target
  expect(Math.abs(r.s.x - (r.t.x - 6))).toBeLessThan(3);
  expect(Math.abs(r.s.w - (r.t.w + 12))).toBeLessThan(3);
  expect(r.a.x).toBeGreaterThanOrEqual(r.t.x - 2);
  expect(r.a.x).toBeLessThanOrEqual(r.t.x + r.t.w + 2);
  expect(r.c.top).toBeGreaterThanOrEqual(0);
  expect(r.c.bottom).toBeLessThanOrEqual(r.vh);
  expect(r.c.top >= r.t.y + r.t.h || r.c.bottom <= r.t.y).toBe(true);

  // Resize: overlay re-measures
  const before = r.s.w;
  await page.setViewportSize({ width: 600, height: 800 });
  await page.waitForTimeout(500);
  r = await rects(page, '[data-tour="inspection-bar"]');
  expect(r.s.w).not.toBe(before);
  expect(Math.abs(r.s.w - (r.t.w + 12))).toBeLessThan(3);
  expect(r.c.right).toBeLessThanOrEqual(r.vw);

  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour-card')).toContainText('Step 2 of 9');
  await page.getByTestId('tour-back').click();
  await expect(page.getByTestId('tour-card')).toContainText('Step 1 of 9');
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour-card')).toContainText('Try it');
  // Overlay does not block the control: clicking the real tab advances the tutorial
  await page.getByRole('tab', { name: 'Checklist' }).click();
  await expect(page.getByTestId('tour-card')).toContainText('Step 4 of 9');
  await expect(page).toHaveURL(/tab=checklist/);
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour-card')).toHaveCount(0);
  await page.goto('/#/help');
  await expect(page.getByText('skipped')).toBeVisible();
});
