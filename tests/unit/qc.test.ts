import { describe, expect, it } from 'vitest';
import { buildDemoInspection } from '../../src/services/demo';
import { defaultSettings } from '../../src/services/inspectionRecord';
import { classifyLine, mergeFindings, runQualityControl, runRules, summarizeFindings } from '../../src/services/estimateQC';
import type { EstimateLine } from '../../src/domain/models';

const demo = () => buildDemoInspection(defaultSettings());
const line = (p: Partial<EstimateLine>): EstimateLine => ({
  id: 'x', lineNo: '1', description: '', quantity: 1, unit: 'EA', unitPrice: null, total: null, component: '', source: 'manual', createdAt: '', updatedAt: '', ...p
});

describe('estimate QC on the seeded demo inspection', () => {
  const insp = demo();
  const findings = runQualityControl(insp);
  const byRule = (r: string) => findings.filter((f) => f.rule === r);

  it('detects the seeded arithmetic error as a confirmed error', () => {
    const a = byRule('arithmetic_line');
    expect(a).toHaveLength(1);
    expect(a[0].classification).toBe('confirmed_arithmetic');
    expect(a[0].explanation).toContain('6,968');
    expect(byRule('arithmetic_total')).toHaveLength(0);
  });
  it('detects the seeded duplicate paint lines as a potential concern', () => {
    const d = byRule('potential_duplicate');
    expect(d).toHaveLength(1);
    expect(d[0].classification).toBe('potential_concern');
  });
  it('flags quantity discrepancies against measurements', () => {
    const q = byRule('quantity_discrepancy').map((f) => f.title);
    expect(q.some((t) => t.includes('Laminated comp. shingle roofing'))).toBe(true);
    expect(q.filter((t) => t.includes('Paint the walls'))).toHaveLength(2);
    expect(q.some((t) => t.includes('Drip edge'))).toBe(false);
    expect(q.some((t) => t.includes('Remove laminated'))).toBe(false);
  });
  it('flags missing roof dimensions and insufficient documentation', () => {
    expect(byRule('missing_dimensions').length).toBeGreaterThanOrEqual(2);
    expect(byRule('insufficient_documentation').some((f) => f.title.includes('Carpet'))).toBe(true);
  });
  it('flags observed damage with no estimate line as a scope decision', () => {
    const s = byRule('scope_decision').map((f) => f.title);
    expect(s.some((t) => t.includes('Rear elevation'))).toBe(true);
    expect(s.some((t) => t.includes('Right elevation'))).toBe(true);
    expect(s.some((t) => t.includes('Kitchen'))).toBe(false);
  });
  it('explains every finding', () => {
    for (const f of findings) expect(f.explanation.length).toBeGreaterThan(20);
  });
  it('summarises confirmed errors separately from potential concerns', () => {
    const s = summarizeFindings(findings);
    expect(s.confirmedArithmetic).toBe(1);
    expect(s.potentialConcerns).toBe(s.total - 1);
  });
});

describe('finding dispositions', () => {
  it('survive re-runs and stale findings are kept, not deleted', () => {
    const insp = demo();
    insp.findings = runQualityControl(insp);
    const arith = insp.findings.find((f) => f.rule === 'arithmetic_line')!;
    arith.status = 'resolved';
    arith.userNote = 'Corrected with estimator';
    // Fix the arithmetic in the estimate data.
    const l = insp.estimate!.lines.find((x) => x.lineNo === '2')!;
    l.total = 6968;
    const rerun = runQualityControl(insp);
    const again = rerun.find((f) => f.id === arith.id)!;
    expect(again.stale).toBe(true);
    expect(again.status).toBe('resolved');
    expect(again.userNote).toBe('Corrected with estimator');
    const dup = insp.findings.find((f) => f.rule === 'potential_duplicate')!;
    dup.status = 'reviewed';
    const merged = mergeFindings(insp.findings, runRules(insp));
    expect(merged.find((f) => f.key === dup.key)!.status).toBe('reviewed');
  });
});

describe('line classification', () => {
  it('maps lines to compatible measurements only', () => {
    expect(classifyLine(line({ description: 'Laminated shingles', unit: 'SQ' }))).toBe('roof_area');
    expect(classifyLine(line({ description: 'Drip edge', unit: 'LF' }))).toBe('drip_edge');
    expect(classifyLine(line({ description: 'Paint the walls', unit: 'SF' }))).toBe('wall_area');
    expect(classifyLine(line({ description: 'Drywall ceiling', unit: 'SF' }))).toBe('ceiling_area');
    expect(classifyLine(line({ description: 'Carpet', unit: 'SY' }))).toBe('floor_area');
    expect(classifyLine(line({ description: 'Haul debris', unit: 'EA' }))).toBeNull();
    expect(classifyLine(line({ description: 'Laminated shingles', unit: 'EA' }))).toBeNull();
  });
  it('flags missing and invalid quantities', () => {
    const insp = demo();
    insp.estimate!.lines = [line({ id: 'a', description: 'Thing', quantity: null }), line({ id: 'b', description: 'Other', quantity: -2 })];
    insp.estimate!.statedTotal = null;
    const f = runRules(insp).filter((d) => d.rule === 'invalid_quantity');
    expect(f).toHaveLength(2);
  });
  it('detects a stated total that does not match the line totals', () => {
    const insp = demo();
    insp.estimate!.statedTotal = 12000;
    expect(runRules(insp).some((d) => d.rule === 'arithmetic_total')).toBe(true);
  });
});
