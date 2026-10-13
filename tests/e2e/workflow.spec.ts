import { expect, test } from '@playwright/test';
import { confirm, dismissTourOffer, download, expectPdf, goModule, PNG, unzip } from './helpers';

const CSV = `Line,Description,Qty,Unit,Unit Price,Total,Room
1,Paint the walls - two coats,500,SF,1.00,450.00,Kitchen
2,Drywall - ceiling,168,SF,2.00,336.00,Kitchen
`;

test('definition of done: complete fictional inspection end-to-end', async ({ page }) => {
  await page.goto('/');
  // 1. Create inspection
  await page.getByTestId('new-inspection').click();
  await page.getByTestId('create-inspection').click();
  await expect(page.getByText('Enter a fictional or authorised inspection reference.')).toBeVisible();
  await page.getByTestId('claim-number').fill('FS-E2E-0001');
  await page.getByTestId('insp-title').fill('E2E water loss');
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await page.getByTestId('create-inspection').click();
  await expect(page).toHaveURL(/mission/);
  await dismissTourOffer(page);

  // 2. Pre-inspection + checklist progression
  await page.getByRole('tab', { name: 'Checklist' }).click();
  await page.getByTestId('complete-pre').click();
  await expect(page.getByText(/^Reviewed /).first()).toBeVisible();
  const first = page.getByTestId('checklist-item').first();
  await first.getByRole('button', { name: 'Completed' }).click();
  await expect(first.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('checklist-item').nth(1).getByRole('button', { name: 'Not applicable' }).click();

  // 3–4. Area + observation
  await page.getByRole('tab', { name: 'Areas & observations' }).click();
  await page.getByTestId('add-area').click();
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByTestId('area-name').fill('Kitchen');
  await page.getByTestId('area-save').click();
  const kitchen = page.getByTestId('area-card').filter({ hasText: 'Kitchen' });
  await kitchen.getByTestId('area-add-observation').click();
  await page.getByTestId('obs-component').fill('Ceiling drywall');
  await page.getByTestId('obs-text').fill('Ceiling has a brown stain about 3 ft by 2 ft.');
  await page.getByRole('button', { name: 'Damage observed', exact: true }).click();
  await page.getByTestId('obs-save').click();
  await expect(kitchen.getByText('1 note(s)')).toBeVisible();

  // Measurements
  await goModule(page, 'measure', '?tab=rooms');
  await dismissTourOffer(page);
  await page.getByTestId('add-room').click();
  const room = page.getByTestId('room-card').first();
  await room.getByTestId('room-length').fill(`14'`);
  await room.getByTestId('room-length').press('Enter');
  await room.getByTestId('room-width').fill('12');
  await room.getByTestId('room-width').press('Enter');
  await room.getByTestId('room-height').fill('96in');
  await room.getByTestId('room-height').press('Enter');
  await room.getByTestId('opening-width').fill('3');
  await room.getByTestId('opening-width').press('Enter');
  await room.getByTestId('opening-height').fill(`6'8"`);
  await room.getByTestId('opening-height').press('Enter');
  await room.getByTestId('add-opening').click();
  await expect(room.getByTestId('room-adjusted')).toHaveText('396 sq ft');
  // invalid input is rejected, not saved
  await room.getByTestId('room-width').fill('abc');
  await room.getByTestId('room-width').press('Enter');
  await expect(room.getByText(/Not a recognised length/)).toBeVisible();
  await room.getByTestId('room-width').fill('12');
  await room.getByTestId('room-width').press('Enter');

  // 5. Photos
  await goModule(page, 'photos');
  await dismissTourOffer(page);
  await page.getByTestId('photo-area-filter').selectOption({ label: 'Kitchen' });
  await page.getByTestId('import-input').setInputFiles({ name: 'kitchen_ceiling_close.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('photo-tile')).toHaveCount(1);
  await page.getByTestId('photo-tile').first().click();
  await page.getByTestId('photo-caption').fill('Kitchen ceiling stain');
  await page.getByTestId('photo-caption').press('Enter');
  // 6. Link evidence
  await page.getByLabel(/Ceiling has a brown stain/).check();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photo-tile').first()).toContainText('Kitchen ceiling stain');

  // 7–8. Report
  await goModule(page, 'notes', '?tab=report');
  await dismissTourOffer(page);
  await page.getByTestId('generate-report').click();
  await expect(page.getByText('Ceiling has a brown stain about 3 ft by 2 ft.').first()).toBeVisible();
  await expect(page.getByText(/Photos? 1/).first()).toBeVisible();
  await page.getByTestId('approve-all').click();
  await page.getByTestId('mark-final').click();
  await confirm(page);
  await expect(page.getByText('Final review complete').first()).toBeVisible();
  const reportPdf = await download(page, () => page.getByTestId('report-pdf').click());
  await expectPdf(reportPdf.data);

  // 9. Estimate import with mapping
  await goModule(page, 'qc', '?tab=import');
  await dismissTourOffer(page);
  await page.getByTestId('csv-input').setInputFiles({ name: 'estimate.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByTestId('map-description')).toHaveValue('Description');
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('estimate-line')).toHaveCount(2);

  // 10. QC
  await page.getByRole('tab', { name: 'QC findings' }).click();
  await page.getByTestId('run-qc').click();
  await expect(page.getByTestId('qc-confirmed')).toHaveText('1');
  await expect(page.getByText(/Quantity differs from measurements — Line 1/)).toBeVisible();
  // 11. Disposition
  for (const f of await page.getByTestId('finding').all()) await f.getByRole('button', { name: 'Reviewed' }).click();
  await expect(page.getByText('Open (not dispositioned)').locator('..').locator('.num')).toHaveText('0');

  // Persistence across reload
  await page.reload();
  await expect(page.getByTestId('qc-confirmed')).toHaveText('1');

  // 12–13. Final review and package export
  await goModule(page, 'export');
  await page.getByTestId('complete-final-review').click();
  if (await page.getByTestId('confirm-ok').isVisible().catch(() => false)) await confirm(page);
  await expect(page.getByText(/^Completed /)).toBeVisible();
  const pkg = await download(page, () => page.getByTestId('export-package').click());
  expect(pkg.name).toMatch(/review-package\.zip$/);
  const zip = await unzip(pkg.data);
  for (const f of ['README.txt', 'report.pdf', 'measurement-worksheet.pdf', 'measurement-worksheet.csv', 'photo-index.pdf', 'qc-summary.pdf', 'qc-findings.csv', 'inspection-data.json'])
    expect(zip.file(f), f).not.toBeNull();
  expect(Object.keys(zip.files).some((n) => n.startsWith('photos/originals/'))).toBe(true);
  await expectPdf(Buffer.from(await zip.file('report.pdf')!.async('uint8array')));
  const data = JSON.parse(await zip.file('inspection-data.json')!.async('string'));
  const insp = data.inspections[0];
  expect(insp.claimNumber).toBe('FS-E2E-0001');
  expect(insp.observations[0].photoIds).toHaveLength(1);
  expect(insp.rooms[0].height).toEqual({ value: 96, unit: 'in' });
  const ws = await zip.file('measurement-worksheet.csv')!.async('string');
  expect(ws).toContain('Adjusted wall 396 sq ft');

  // Dashboard reflects workflow
  await page.goto('/');
  await expect(page.getByTestId('inspection-card').filter({ hasText: 'FS-E2E-0001' })).toBeVisible();
});
