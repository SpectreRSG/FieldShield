import { expect, test } from '@playwright/test';
import { confirm, dismissTourOffer, download, expectPdf, goModule } from './helpers';

test('demo inspection: seeded QC issues, gaps and exports', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-demo').click();
  await expect(page).toHaveURL(/mission/);
  await dismissTourOffer(page);
  await page.getByRole('tab', { name: 'Gaps & checks' }).click();
  await expect(page.getByText(/Right hip end" is missing: height/)).toBeVisible();
  await expect(page.getByText(/Contradiction at/)).toBeVisible();
  await goModule(page, 'qc', '?tab=findings');
  await page.getByTestId('run-qc').click();
  await expect(page.getByTestId('qc-confirmed')).toHaveText('1');
  expect(Number(await page.getByTestId('qc-potential').textContent())).toBeGreaterThan(5);
  const qc = await download(page, () => page.getByTestId('qc-pdf').click());
  await expectPdf(qc.data);
  await goModule(page, 'photos', '?tab=index');
  const idx = await download(page, () => page.getByTestId('photo-index-pdf').click());
  await expectPdf(idx.data);
  // accept suggestion on the unassigned photo
  await goModule(page, 'photos', '?tab=library');
  await dismissTourOffer(page);
  await page.getByTestId('photo-tile').filter({ hasText: 'Unassigned' }).click();
  await page.getByTestId('accept-suggestion').click();
  await expect(page.getByTestId('photo-area')).toHaveValue(/area_/);
  // annotation creates a copy and keeps the original
  await page.getByTestId('annotate').click();
  const canvas = page.getByTestId('annot-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('save-annotation').click();
  await expect(page.getByText('Photo 11 (annotated copy)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photo-tile')).toHaveCount(11);
});

test('works offline after first load and keeps data after reload', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(async () => !!(await navigator.serviceWorker?.ready));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.hero .tagline')).toHaveText('Inspect. Document. Verify.');
  await page.getByTestId('new-inspection').click();
  await page.getByTestId('claim-number').fill('FS-OFFLINE-1');
  await page.getByRole('button', { name: 'Hail', exact: true }).click();
  await page.getByTestId('create-inspection').click();
  await expect(page).toHaveURL(/mission/);
  await page.reload();
  await expect(page.getByText('FS-OFFLINE-1').first()).toBeVisible();
  await context.setOffline(false);
});

test('backup and restore round trip with validation', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-demo').click();
  await expect(page).toHaveURL(/mission/);
  await page.goto('/#/settings');
  const backup = await download(page, () => page.getByTestId('backup-all').click());
  const json = JSON.parse(backup.data.toString());
  expect(json.format).toBe('fieldshield-backup');
  expect(Object.keys(json.blobs).length).toBe(20);
  // A damaged file is rejected without changing anything
  await page.getByTestId('restore-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"x"') });
  await expect(page.getByText(/not valid JSON/)).toBeVisible();
  // Delete the inspection, then restore it
  await page.goto('/');
  await page.getByTestId('inspection-card').first().click();
  await dismissTourOffer(page);
  await page.getByRole('button', { name: 'Delete…' }).click();
  await confirm(page);
  await expect(page.getByText('Inspection deleted')).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('inspection-card')).toHaveCount(0);
  await page.goto('/#/settings');
  await page.getByTestId('restore-input').setInputFiles({ name: backup.name, mimeType: 'application/json', buffer: backup.data });
  await expect(page.getByText(/Restored 1 inspection\(s\) and 20 image file\(s\)/)).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('inspection-card')).toHaveCount(1);
});
