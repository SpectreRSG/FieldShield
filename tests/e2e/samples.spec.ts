import { test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { confirm, dismissTourOffer, download, goModule } from './helpers';
import { DEMO_ESTIMATE_CSV } from '../../src/services/demo';

test('generate sample outputs from the fictional demo', async ({ page }) => {
  mkdirSync('samples', { recursive: true });
  const save = (name: string, data: Buffer | string) => writeFileSync(`samples/${name}`, data);
  await page.goto('/');
  await page.getByTestId('load-demo').click();
  await page.waitForURL(/mission/);
  await dismissTourOffer(page);
  // QC with a few dispositions
  await goModule(page, 'qc', '?tab=findings');
  await page.getByTestId('run-qc').click();
  const findings = page.getByTestId('finding');
  await findings.nth(0).getByRole('button', { name: 'Requires follow-up' }).click();
  await findings.nth(1).getByRole('button', { name: 'Reviewed' }).click();
  save('sample-qc-summary.pdf', (await download(page, () => page.getByTestId('qc-pdf').click())).data);
  save('sample-qc-findings.csv', (await download(page, () => page.getByRole('button', { name: 'CSV' }).click())).data);
  // Report: generate, approve, final
  await goModule(page, 'notes', '?tab=report');
  await page.getByTestId('generate-report').click();
  await page.getByTestId('approve-all').click();
  await page.getByTestId('mark-final').click();
  await confirm(page);
  save('sample-inspection-report.pdf', (await download(page, () => page.getByTestId('report-pdf').click())).data);
  // Worksheet
  await goModule(page, 'measure', '?tab=worksheet');
  save('sample-measurement-worksheet.pdf', (await download(page, () => page.getByTestId('worksheet-pdf').click())).data);
  save('sample-measurement-worksheet.csv', (await download(page, () => page.getByTestId('worksheet-csv').click())).data);
  // Photo index
  await goModule(page, 'photos', '?tab=index');
  save('sample-photo-index.pdf', (await download(page, () => page.getByTestId('photo-index-pdf').click())).data);
  // Package
  await goModule(page, 'export');
  save('sample-review-package.zip', (await download(page, () => page.getByTestId('export-package').click())).data);
  save('sample-estimate.csv', DEMO_ESTIMATE_CSV);
});
