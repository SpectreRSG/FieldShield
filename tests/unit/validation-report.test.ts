import { describe, expect, it } from 'vitest';
import { buildDemoInspection } from '../../src/services/demo';
import { createInspection, defaultSettings } from '../../src/services/inspectionRecord';
import { findConsistencyIssues, findGaps, missingShotTypes } from '../../src/services/validation';
import { generateReport, LIMITATIONS_TEXT, reportIsOutdated } from '../../src/services/reportGenerator';
import { buildChecklist, checklistProgress, DEFAULT_CHECKLIST_TEMPLATE, mergeChecklist } from '../../src/services/checklists';
import { InspectionSchema } from '../../src/domain/models';

const settings = defaultSettings();

describe('checklists', () => {
  it('generates items by loss type and never marks them required', () => {
    const water = buildChecklist(DEFAULT_CHECKLIST_TEMPLATE, ['water']);
    const hail = buildChecklist(DEFAULT_CHECKLIST_TEMPLATE, ['hail']);
    expect(water.some((i) => i.origin === 'fld-moisture-map')).toBe(true);
    expect(hail.some((i) => i.origin === 'fld-moisture-map')).toBe(false);
    expect(hail.some((i) => i.origin === 'fld-roof-test')).toBe(true);
    expect([...water, ...hail].every((i) => !i.required)).toBe(true);
  });
  it('respects disabled template items and merges without losing progress', () => {
    const tpl = DEFAULT_CHECKLIST_TEMPLATE.map((t) => (t.id === 'fld-roof-test' ? { ...t, enabled: false } : t));
    const items = buildChecklist(tpl, ['hail']);
    expect(items.some((i) => i.origin === 'fld-roof-test')).toBe(false);
    items[0].status = 'completed';
    const merged = mergeChecklist(items, DEFAULT_CHECKLIST_TEMPLATE, ['hail', 'water']);
    expect(merged[0].status).toBe('completed');
    expect(merged.some((i) => i.origin === 'fld-moisture-map')).toBe(true);
  });
  it('excludes not-applicable items from completion', () => {
    const items = buildChecklist(DEFAULT_CHECKLIST_TEMPLATE, ['fire']);
    items.forEach((i, n) => (i.status = n === 0 ? 'completed' : 'not_applicable'));
    expect(checklistProgress(items).percent).toBe(100);
  });
});

describe('completeness and consistency', () => {
  const insp = buildDemoInspection(settings);
  it('produces schema-valid demo data', () => {
    expect(InspectionSchema.safeParse(insp).success).toBe(true);
  });
  it('identifies missing photos, measurements, notes and reviews', () => {
    const gaps = findGaps(insp);
    const msgs = gaps.map((g) => g.message).join('\n');
    expect(msgs).toMatch(/Right hip end" is missing: height/);
    expect(msgs).toMatch(/Living room" is missing: ceiling height/);
    expect(msgs).toMatch(/not assigned to an inspection area/);
    expect(msgs).toMatch(/classification needs your confirmation/);
    expect(msgs).toMatch(/Final departure review/);
    expect(msgs).toMatch(/No inspection report/);
    expect(gaps.some((g) => g.category === 'notes')).toBe(false);
    const copy = structuredClone(insp);
    copy.areas.push({ ...copy.areas[0], id: 'area_new', name: 'Garage interior' });
    expect(findGaps(copy).some((g) => g.category === 'notes' && /Garage interior/.test(g.message))).toBe(true);
    const kitchen = insp.areas.find((a) => a.name === 'Kitchen')!;
    expect(missingShotTypes(insp, kitchen.id)).toEqual(['closeup']);
  });
  it('flags the seeded contradiction and unsupported conclusion', () => {
    const issues = findConsistencyIssues(insp);
    expect(issues.some((i) => i.severity === 'contradiction' && /Window screen/i.test(i.message))).toBe(true);
    expect(issues.some((i) => /cause language/.test(i.message) && /Front slope test square/.test(i.message))).toBe(true);
  });
  it('flags coverage language', () => {
    const copy = structuredClone(insp);
    copy.observations[0].text = 'This is not covered.';
    expect(findConsistencyIssues(copy).some((i) => /coverage/.test(i.message))).toBe(true);
  });
});

describe('report generation', () => {
  const insp = buildDemoInspection(settings);
  const report = generateReport(insp, { inspectorName: '', unitSystem: 'imperial' });
  it('only uses recorded information and states gaps', () => {
    const body = report.sections.map((s) => s.body).join('\n');
    for (const o of insp.observations) expect(body).toContain(o.text);
    expect(body).toContain('Not recorded');
    expect(body).toContain(LIMITATIONS_TEXT);
    expect(body).toMatch(/Measured roof surface area: 2,010 sq ft/);
    expect(report.status).toBe('draft');
  });
  it('builds a damage table with photo references', () => {
    expect(report.damageTable.length).toBe(insp.observations.filter((o) => o.condition === 'damage_observed').length);
    expect(report.damageTable.some((r) => /Photo/.test(r.photos))).toBe(true);
  });
  it('references source records and detects when they change', () => {
    expect(report.sourceRecordIds.observations).toHaveLength(insp.observations.length);
    const copy = structuredClone(insp);
    copy.reports = [report];
    expect(reportIsOutdated(copy, report)).toBe(false);
    copy.observations[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    expect(reportIsOutdated(copy, report)).toBe(true);
  });
  it('preserves user edits across regeneration and flags changed source data', () => {
    const copy = structuredClone(insp);
    const r1 = structuredClone(report);
    const sec = r1.sections.find((s) => s.key === 'measurements')!;
    sec.body = 'My edited measurement text';
    sec.edited = true;
    copy.reports = [r1];
    copy.roofPlanes[3].width = { value: 14, unit: 'ft' };
    const r2 = generateReport(copy, { inspectorName: '', unitSystem: 'imperial' });
    const s2 = r2.sections.find((s) => s.key === 'measurements')!;
    expect(r2.version).toBe(2);
    expect(s2.body).toBe('My edited measurement text');
    expect(s2.sourceChanged).toBe(true);
    expect(s2.generatedBody).toMatch(/2,220 sq ft/);
  });
  it('new inspections report missing information instead of inventing it', () => {
    const blank = createInspection({ claimNumber: 'FS-T-1', lossTypes: ['wind'] }, settings);
    const r = generateReport(blank, { inspectorName: '', unitSystem: 'metric' });
    const body = r.sections.map((s) => s.body).join('\n');
    expect(body).toContain('No direct observations were recorded for this area.');
    expect(body).toContain('No measurements have been recorded.');
  });
});
