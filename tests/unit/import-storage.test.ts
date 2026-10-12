import { describe, expect, it, beforeEach } from 'vitest';
import { applyMapping, guessMapping, parseCsv, parseNumber } from '../../src/services/estimateImport';
import { buildDemoInspection } from '../../src/services/demo';
import { createInspection, defaultSettings } from '../../src/services/inspectionRecord';
import { createIndexedDbStore, resetDbConnection, DB_NAME } from '../../src/data/indexedDb';

describe('CSV import and mapping', () => {
  const insp = buildDemoInspection(defaultSettings());
  it('guesses a sensible mapping', () => {
    const m = guessMapping(['Line', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total', 'Room']);
    expect(m).toEqual({ lineNo: 'Line', description: 'Description', quantity: 'Qty', unit: 'Unit', unitPrice: 'Unit Price', total: 'Total', area: 'Room' });
  });
  it('parses money and blank values', () => {
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('(12.00)')).toBe(-12);
    expect(parseNumber('')).toBeNull();
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
  it('maps rows, links areas and reports problems per row', () => {
    const csv = 'Item,Desc,Quantity,UOM,Area\n1,Paint walls,100,SF,Kitchen\n2,,5,EA,\n3,Thing,abc,EA,Garage attic\n';
    const parsed = parseCsv(csv);
    const res = applyMapping(parsed, { lineNo: 'Item', description: 'Desc', quantity: 'Quantity', unit: 'UOM', area: 'Area' }, insp);
    expect(res.lines).toHaveLength(2);
    expect(res.skipped).toBe(1);
    expect(res.lines[0].areaId).toBe(insp.areas.find((a) => a.name === 'Kitchen')!.id);
    expect(res.lines[1].quantity).toBeNull();
    expect(res.rowErrors.join(' ')).toMatch(/not a number/);
    expect(res.rowErrors.join(' ')).toMatch(/did not match/);
  });
  it('refuses to import without required columns', () => {
    const parsed = parseCsv('A,B\n1,2\n');
    const res = applyMapping(parsed, {}, insp);
    expect(res.lines).toHaveLength(0);
    expect(res.rowErrors[0]).toMatch(/required/);
  });
});

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    await resetDbConnection();
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => r();
      req.onerror = () => r();
    });
  });
  it('saves, restores and deletes inspections and blobs', async () => {
    const store = createIndexedDbStore();
    const insp = createInspection({ claimNumber: 'FS-T-2', lossTypes: ['water'] }, defaultSettings());
    await store.inspections.put(insp);
    await store.blobs.put('k1', new Blob(['hello'], { type: 'text/plain' }));
    await resetDbConnection();
    const fresh = createIndexedDbStore();
    const list = await fresh.inspections.list();
    expect(list).toHaveLength(1);
    expect(list[0].claimNumber).toBe('FS-T-2');
    expect(await fresh.blobs.keys()).toEqual(['k1']);
    await fresh.inspections.remove(insp.id);
    expect(await fresh.inspections.list()).toHaveLength(0);
  });
  it('stores settings and tutorial progress', async () => {
    const store = createIndexedDbStore();
    await store.settings.putSettings({ ...defaultSettings(), unitSystem: 'metric' });
    expect((await store.settings.getSettings())!.unitSystem).toBe('metric');
    await store.settings.putTutorial({ id: 'mission', status: 'completed', lastStep: 3, updatedAt: '' });
    expect(await store.settings.getTutorials()).toHaveLength(1);
    await store.settings.resetTutorial('mission');
    expect(await store.settings.getTutorials()).toHaveLength(0);
  });
});
