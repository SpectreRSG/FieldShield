import { expect, test } from '@playwright/test';

test('no page is wider than the screen (no horizontal page scroll)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-demo').click();
  await page.waitForURL(/mission/);
  const pages = ['mission?tab=overview', 'mission?tab=checklist', 'mission?tab=areas', 'mission?tab=gaps', 'measure?tab=roof', 'measure?tab=rooms', 'photos?tab=library', 'photos?tab=coverage', 'photos?tab=index', 'notes?tab=notes', 'notes?tab=report', 'qc?tab=estimate', 'qc?tab=import', 'qc?tab=findings', 'export'];
  const base = page.url().replace(/\/mission.*$/, '');
  const vw = page.viewportSize()!.width;
  for (const p of pages) {
    await page.goto(`${base}/${p}`);
    await page.waitForTimeout(250);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(w.iw, `${p} layout viewport`).toBe(vw);
    expect(w.sw, `${p} scroll width`).toBeLessThanOrEqual(vw);
  }
  for (const p of ['/#/', '/#/settings', '/#/help', '/#/new']) {
    await page.goto(p);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(vw);
  }
});
