/**
 * Estimate Review Rules Engine.
 *
 * Compares estimate lines with recorded inspection evidence and produces
 * explained findings. Confirmed arithmetic errors are classified separately
 * from potential scope concerns. The engine never decides coverage, approves
 * or denies anything, or prescribes repairs — every finding is a prompt for
 * the user's review.
 */
import type { EstimateLine, FindingRule, Inspection, QCFinding, RoomMeasurement } from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { areaLabel } from './inspectionRecord';
import { calcRoom, summarizeRoof } from './measurement';
import { fmtNumber, round } from './units';

export type MeasureKind =
  | 'roof_area'
  | 'drip_edge'
  | 'ridge_cap'
  | 'valley'
  | 'starter'
  | 'wall_area'
  | 'ceiling_area'
  | 'floor_area'
  | 'baseboard'
  | null;

export function normalizeUnit(u: string): 'SQ' | 'SF' | 'LF' | 'SY' | 'EA' | string {
  const x = u.trim().toUpperCase().replace(/\./g, '');
  if (['SQ', 'SQS', 'SQUARE', 'SQUARES'].includes(x)) return 'SQ';
  if (['SF', 'SQFT', 'SQ FT', 'FT2', 'SFT'].includes(x)) return 'SF';
  if (['LF', 'LIN FT', 'LINFT', 'FT', 'LINEAR FT'].includes(x)) return 'LF';
  if (['SY', 'SQYD', 'SQ YD', 'YD2'].includes(x)) return 'SY';
  if (['EA', 'EACH'].includes(x)) return 'EA';
  return x;
}

/** Decide which recorded measurement (if any) a line can be compared with. */
export function classifyLine(line: EstimateLine): MeasureKind {
  const d = `${line.description} ${line.component}`.toLowerCase();
  const u = normalizeUnit(line.unit);
  if (/drip edge/.test(d) && u === 'LF') return 'drip_edge';
  if (/(ridge|hip)\s*(cap|vent)?/.test(d) && /cap/.test(d) && u === 'LF') return 'ridge_cap';
  if (/valley/.test(d) && u === 'LF') return 'valley';
  if (/starter/.test(d) && u === 'LF') return 'starter';
  if (/(shingle|roofing|roof cover|underlayment|felt|ice (?:&|and) water|tear ?off|remove.*roof)/.test(d) && (u === 'SQ' || u === 'SF'))
    return 'roof_area';
  if (/baseboard|base board|quarter round/.test(d) && u === 'LF') return 'baseboard';
  if (/ceiling/.test(d) && (u === 'SF' || u === 'SY')) return 'ceiling_area';
  if (/(wall|drywall|sheetrock|paint|texture|wallpaper)/.test(d) && u === 'SF') return 'wall_area';
  if (/(carpet|floor|pad|vinyl|tile|laminate|hardwood|lvp)/.test(d) && (u === 'SF' || u === 'SY')) return 'floor_area';
  return null;
}

/** Find the room a line refers to: explicit area link first, then a name match in the description. */
export function matchRoom(insp: Inspection, line: EstimateLine): RoomMeasurement | undefined {
  if (line.areaId) {
    const byArea = insp.rooms.find((r) => r.areaId === line.areaId);
    if (byArea) return byArea;
  }
  const d = line.description.toLowerCase();
  return [...insp.rooms]
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => r.name.trim() && d.includes(r.name.trim().toLowerCase()));
}

interface Draft {
  key: string;
  rule: FindingRule;
  title: string;
  explanation: string;
  relatedIds: string[];
}

const normDesc = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function lineLabel(l: EstimateLine): string {
  return `${l.lineNo ? `Line ${l.lineNo}: ` : ''}${l.description}`;
}

export function runRules(insp: Inspection): Draft[] {
  const est = insp.estimate;
  if (!est) return [];
  const out: Draft[] = [];
  const roof = summarizeRoof(insp.roofPlanes, insp.roofLines, insp.wasteScenarios);
  const maxWaste = insp.wasteScenarios.length ? Math.max(...insp.wasteScenarios) : 0;

  // 1. Arithmetic (confirmed when every number is present and they disagree).
  let sumTotals = 0;
  let allTotals = true;
  for (const l of est.lines) {
    if (l.total === null) allTotals = false;
    else sumTotals += l.total;
    if (l.quantity !== null && l.unitPrice !== null && l.total !== null) {
      const expected = round(l.quantity * l.unitPrice, 2);
      if (Math.abs(expected - l.total) > 0.01) {
        out.push({
          key: `arith-${l.id}`,
          rule: 'arithmetic_line',
          title: `Arithmetic error — ${lineLabel(l)}`,
          explanation: `Quantity × unit price = ${fmtNumber(l.quantity)} × ${fmtNumber(l.unitPrice)} = ${fmtNumber(expected)}, but the line total is ${fmtNumber(l.total)} (difference ${fmtNumber(l.total - expected)}).`,
          relatedIds: [l.id]
        });
      }
    }
  }
  if (est.statedTotal !== null && allTotals && est.lines.length) {
    const s = round(sumTotals, 2);
    if (Math.abs(s - est.statedTotal) > 0.01) {
      out.push({
        key: 'arith-total',
        rule: 'arithmetic_total',
        title: 'Arithmetic error — estimate total',
        explanation: `The line totals add up to ${fmtNumber(s)}, but the stated estimate total is ${fmtNumber(est.statedTotal)} (difference ${fmtNumber(est.statedTotal - s)}).`,
        relatedIds: []
      });
    }
  }

  // 2. Invalid / missing quantities.
  for (const l of est.lines) {
    if (l.quantity === null || l.quantity <= 0) {
      out.push({
        key: `qty-${l.id}`,
        rule: 'invalid_quantity',
        title: `Missing or invalid quantity — ${lineLabel(l)}`,
        explanation: `The quantity is ${l.quantity === null ? 'blank' : fmtNumber(l.quantity)}. A positive quantity is needed before this line can be compared with measurements.`,
        relatedIds: [l.id]
      });
    }
  }

  // 3. Potential duplicates.
  const groups = new Map<string, EstimateLine[]>();
  for (const l of est.lines) {
    const k = `${normDesc(l.description)}|${l.areaId ?? ''}|${normalizeUnit(l.unit)}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  for (const [, ls] of groups) {
    if (ls.length > 1) {
      const ids = ls.map((l) => l.id).sort();
      out.push({
        key: `dup-${ids.join('-')}`,
        rule: 'potential_duplicate',
        title: `Potential duplicate — "${ls[0].description}"`,
        explanation: `${ls.length} lines share the same description, unit and location (${ls.map((l) => l.lineNo || '?').join(', ')}). They may be intentional (e.g. separate layers) — confirm whether each is needed.`,
        relatedIds: ids
      });
    }
  }

  // 4. Quantity comparison with compatible measurements.
  for (const l of est.lines) {
    if (l.quantity === null || l.quantity <= 0) continue;
    const kind = classifyLine(l);
    if (!kind) continue;
    const u = normalizeUnit(l.unit);
    const compare = (measured: number, measuredLabel: string, unitLabel: string, upperFactor: number, lowerFactor: number) => {
      const upper = measured * upperFactor;
      const lower = measured * lowerFactor;
      if (l.quantity! > upper + 1e-9 || l.quantity! < lower - 1e-9) {
        const pct = measured > 0 ? ((l.quantity! - measured) / measured) * 100 : 0;
        out.push({
          key: `qty-cmp-${l.id}`,
          rule: 'quantity_discrepancy',
          title: `Quantity differs from measurements — ${lineLabel(l)}`,
          explanation: `Estimate quantity ${fmtNumber(l.quantity!)} ${unitLabel} vs ${measuredLabel} ${fmtNumber(measured)} ${unitLabel} (${pct >= 0 ? '+' : ''}${fmtNumber(pct, 1)}%). Review range used: ${fmtNumber(lower)}–${fmtNumber(upper)} ${unitLabel}. This may reflect waste, scope choices, or a measurement gap — it is not an error by itself.`,
          relatedIds: [l.id]
        });
      }
    };

    if (kind === 'roof_area') {
      if (roof.completePlanes === 0) {
        out.push(missingDims(l, 'no complete roof plane measurements are recorded'));
        continue;
      }
      if (roof.incompletePlanes.length) {
        out.push(missingDims(l, `${roof.incompletePlanes.length} roof plane(s) are missing dimensions, so the measured total may be understated`));
      }
      const measured = u === 'SQ' ? roof.totalSquares : roof.totalAreaSqft;
      compare(measured, `measured roof area${maxWaste ? ` (allowing up to the ${maxWaste}% waste scenario)` : ''}`, u, 1 + maxWaste / 100 + 0.01, 0.98);
      continue;
    }
    const linear = (label: string, ft: number) => {
      if (ft <= 0) out.push(missingDims(l, `no ${label} lengths are recorded`));
      else compare(ft, `recorded ${label} length`, 'LF', 1.1, 0.95);
    };
    if (kind === 'drip_edge') { linear('eave + rake', roof.linearTotalsFt.eave + roof.linearTotalsFt.rake); continue; }
    if (kind === 'ridge_cap') { linear('ridge + hip', roof.linearTotalsFt.ridge + roof.linearTotalsFt.hip); continue; }
    if (kind === 'valley') { linear('valley', roof.linearTotalsFt.valley); continue; }
    if (kind === 'starter') { linear('eave + rake', roof.linearTotalsFt.eave + roof.linearTotalsFt.rake); continue; }

    // Interior lines.
    const room = matchRoom(insp, l);
    if (!room) {
      out.push(missingDims(l, 'it is not linked to a measured room (link it to a room area, or include the room name in the description)'));
      continue;
    }
    const c = calcRoom(room);
    const toUnit = (sqft: number) => (u === 'SY' ? sqft / 9 : sqft);
    const metric =
      kind === 'wall_area' ? c.adjustedWallSqft : kind === 'ceiling_area' ? c.ceilingSqft : kind === 'floor_area' ? c.floorSqft : c.perimeterFt;
    const label =
      kind === 'wall_area' ? `${room.name} adjusted wall area` : kind === 'ceiling_area' ? `${room.name} ceiling area` : kind === 'floor_area' ? `${room.name} floor area` : `${room.name} perimeter`;
    if (metric === null) {
      out.push(missingDims(l, `${room.name} is missing: ${c.missing.join(', ') || 'dimensions'}`));
      continue;
    }
    compare(kind === 'baseboard' ? metric : toUnit(metric), label, kind === 'baseboard' ? 'LF' : u, 1.1, 0.9);
  }

  // 5. Documentation behind each line.
  for (const l of est.lines) {
    const areaId = l.areaId ?? matchRoom(insp, l)?.areaId;
    if (!areaId) {
      out.push({
        key: `doc-unlinked-${l.id}`,
        rule: 'insufficient_documentation',
        title: `Not linked to an inspection area — ${lineLabel(l)}`,
        explanation: 'This line is not associated with an inspection area, so it cannot be traced to photographs or observations. Link it to an area to review its support.',
        relatedIds: [l.id]
      });
      continue;
    }
    const photos = insp.photos.filter((p) => p.areaId === areaId).length;
    const obs = insp.observations.filter((o) => o.areaId === areaId && o.kind === 'direct_observation').length;
    if (photos === 0 || obs === 0) {
      const missing = [photos === 0 ? 'photographs' : '', obs === 0 ? 'direct observations' : ''].filter(Boolean).join(' or ');
      out.push({
        key: `doc-${l.id}`,
        rule: 'insufficient_documentation',
        title: `Insufficiently documented — ${lineLabel(l)}`,
        explanation: `${areaLabel(insp, areaId)} has no ${missing} recorded to support this line.`,
        relatedIds: [l.id, areaId]
      });
    }
  }

  // 6. Observed damage with no corresponding estimate line → scope decision needed.
  const coveredAreas = new Set(est.lines.map((l) => l.areaId ?? matchRoom(insp, l)?.areaId).filter(Boolean) as string[]);
  const roofAreaIds = new Set(insp.areas.filter((a) => a.kind === 'roof' || a.kind === 'roof_plane').map((a) => a.id));
  const hasRoofLine = est.lines.some((l) => classifyLine(l) === 'roof_area');
  for (const o of insp.observations) {
    if (o.condition !== 'damage_observed' || !o.areaId) continue;
    if (coveredAreas.has(o.areaId)) continue;
    if (roofAreaIds.has(o.areaId) && hasRoofLine) continue;
    out.push({
      key: `scope-${o.id}`,
      rule: 'scope_decision',
      title: `Observation requires a scope decision — ${areaLabel(insp, o.areaId)}`,
      explanation: `Damage was recorded ("${o.text.slice(0, 80)}") but no estimate line is linked to this area. Decide whether it is in scope, out of scope, or needs follow-up.`,
      relatedIds: [o.id, o.areaId]
    });
  }
  return out;
}

function missingDims(l: EstimateLine, why: string): Draft {
  return {
    key: `dims-${l.id}`,
    rule: 'missing_dimensions',
    title: `Missing dimensions — ${lineLabel(l)}`,
    explanation: `This quantity cannot be compared with recorded measurements because ${why}.`,
    relatedIds: [l.id]
  };
}

export function classificationFor(rule: FindingRule): QCFinding['classification'] {
  return rule === 'arithmetic_line' || rule === 'arithmetic_total' ? 'confirmed_arithmetic' : 'potential_concern';
}

/**
 * Merge a fresh rules run into existing findings: existing dispositions and notes
 * are kept for matching keys; findings that no longer reproduce are marked stale
 * (never silently deleted).
 */
export function mergeFindings(existing: QCFinding[], drafts: Draft[]): QCFinding[] {
  const now = nowIso();
  const byKey = new Map(existing.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const result: QCFinding[] = [];
  for (const d of drafts) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    const prev = byKey.get(d.key);
    result.push({
      id: prev?.id ?? newId('qc'),
      key: d.key,
      rule: d.rule,
      classification: classificationFor(d.rule),
      title: d.title,
      explanation: d.explanation,
      relatedIds: d.relatedIds,
      status: prev?.status ?? 'open',
      userNote: prev?.userNote ?? '',
      stale: false,
      createdAt: prev?.createdAt ?? now,
      updatedAt: prev && prev.explanation === d.explanation && !prev.stale ? prev.updatedAt : now
    });
  }
  for (const f of existing) {
    if (!seen.has(f.key)) result.push({ ...f, stale: true });
  }
  return result;
}

export function runQualityControl(insp: Inspection): QCFinding[] {
  return mergeFindings(insp.findings, runRules(insp));
}

export interface QCSummary {
  total: number;
  confirmedArithmetic: number;
  potentialConcerns: number;
  byStatus: Record<QCFinding['status'], number>;
  byRule: Partial<Record<FindingRule, number>>;
  stale: number;
}

export function summarizeFindings(findings: QCFinding[]): QCSummary {
  const active = findings.filter((f) => !f.stale);
  const byStatus = { open: 0, reviewed: 0, resolved: 0, not_applicable: 0, follow_up: 0 } as QCSummary['byStatus'];
  const byRule: QCSummary['byRule'] = {};
  for (const f of active) {
    byStatus[f.status] += 1;
    byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  }
  return {
    total: active.length,
    confirmedArithmetic: active.filter((f) => f.classification === 'confirmed_arithmetic').length,
    potentialConcerns: active.filter((f) => f.classification === 'potential_concern').length,
    byStatus,
    byRule,
    stale: findings.length - active.length
  };
}

export const RULE_LABELS: Record<FindingRule, string> = {
  arithmetic_line: 'Line arithmetic',
  arithmetic_total: 'Estimate total arithmetic',
  invalid_quantity: 'Missing / invalid quantity',
  potential_duplicate: 'Potential duplicate',
  quantity_discrepancy: 'Quantity discrepancy',
  missing_dimensions: 'Missing dimensions',
  insufficient_documentation: 'Insufficient documentation',
  scope_decision: 'Scope decision needed'
};
