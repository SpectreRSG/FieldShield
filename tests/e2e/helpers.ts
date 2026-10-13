import { expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// 8×6 red PNG (synthetic test image).
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAGklEQVR4nGP8z8DAwMDAxMDAwMDw//9/BgYAKh0DBQ5wHkIAAAAASUVORK5CYII=',
  'base64'
);

export async function confirm(page: Page) {
  await page.getByTestId('confirm-ok').click();
}

export async function goModule(page: Page, module: string, query = '') {
  const m = page.url().match(/#\/i\/([^/]+)/);
  if (!m) throw new Error('not in an inspection: ' + page.url());
  await page.goto(`/#/i/${m[1]}/${module}${query}`);
}

export async function dismissTourOffer(page: Page) {
  const offer = page.getByTestId('tour-offer');
  if (await offer.isVisible().catch(() => false)) await offer.getByRole('button', { name: 'No thanks' }).click();
}

export async function download(page: Page, click: () => Promise<void>) {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const path = await d.path();
  return { name: d.suggestedFilename(), data: readFileSync(path!) };
}

export async function expectPdf(buf: Buffer) {
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1500);
}

export async function unzip(buf: Buffer) {
  return JSZip.loadAsync(buf);
}
