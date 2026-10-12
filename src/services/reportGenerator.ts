/**
 * Field Notes and Report Assistant — report generator.
 *
 * Builds an editable draft report strictly from recorded data. Each sentence
 * comes from a user-entered note, a recorded measurement, or a calculation.
 * Where information is missing, the report states the gap instead of filling it.
 */
import type {
  DamageRow,
  Inspection,
  InspectionArea,
  Observation,
  Report,
  ReportSection,
  UnitSystem
} from '../domain/models';
import {
  CONDITION_LABELS,
  INSPECTION_STATUS_LABELS,
  LOSS_TYPE_LABELS,
  OBSERVATION_KIND_LABELS,
  PROPERTY_TYPE_LABELS,
  VALUE_SOURCE_LABELS
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { areaLabel, photoNumber } from './inspectionRecord';
import { calcRoom, roofPlaneArea, summarizeRoof } from './measurement';
import { fmtArea, fmtLengthFt, toFeet } from './units';
import { findConsistencyIssues, findGaps } from './validation';

export const LIMITATIONS_TEXT =
  'This report documents conditions observed and information recorded during the inspection. ' +
  'It does not determine coverage, approve or deny a claim, set a settlement amount, or prescribe repairs. ' +
  'Photographs document conditions at the time they were taken and do not by themselves establish cause, coverage, or repair necessity. ' +
  'Reported statements are recorded as told and have not been independently verified unless noted. ' +
  'Preliminary interpretations are the inspector’s working assessments and require review before any decision is made.';

export function describeMeasurement(insp: Inspection, id: string, system: UnitSystem): string | null {
  const plane = insp.roofPlanes.find((p) => p.id === id);
  if (plane) {
    const r = roofPlaneArea(plane);
    return `Roof plane ${plane.name}: ${r.value === null ? `incomplete (missing ${r.missing.join(', ')})` : fmtArea(r.value, system)} [${VALUE_SOURCE_LABELS[plane.source].toLowerCase()}]`;
  }
  const room = insp.rooms.find((r) => r.id === id);
  if (room) {
    const c = calcRoom(room);
    const parts = [
      c.floorSqft !== null ? `floor ${fmtArea(c.floorSqft, system)}` : 'floor incomplete',
      c.adjustedWallSqft !== null ? `walls ${fmtArea(c.adjustedWallSqft, system)}` : 'walls incomplete'
    ];
    return `Room ${room.name}: ${parts.join(', ')} [${VALUE_SOURCE_LABELS[room.source].toLowerCase()}]`;
  }
  const line = insp.roofLines.find((l) => l.id === id);
  if (line) {
    const feet = toFeet(line.length);
    return `${line.kind[0].toUpperCase()}${line.kind.slice(1)}: ${fmtLengthFt(feet, system)} [${VALUE_SOURCE_LABELS[line.source].toLowerCase()}]`;
  }
  return null;
}

function photoRefs(insp: Inspection, ids: string[]): string {
  const nums = ids.map((id) => photoNumber(insp, id)).filter((n) => n > 0).sort((a, b) => a - b);
  if (!nums.length) return '';
  return nums.length === 1 ? `Photo ${nums[0]}` : `Photos ${nums.join(', ')}`;
}

function obsLine(insp: Inspection, o: Observation, system: UnitSystem): string {
  const bits: string[] = [];
  if (o.component) bits.push(`Component: ${o.component}`);
  if (o.condition !== 'not_assessed') bits.push(CONDITION_LABELS[o.condition]);
  const photos = photoRefs(insp, o.photoIds);
  if (photos) bits.push(photos);
  const meas = o.measurementIds.map((m) => describeMeasurement(insp, m, system)).filter(Boolean);
  if (meas.length) bits.push(`Measurements: ${meas.join('; ')}`);
  const who = o.kind === 'reported_statement' && o.reportedBy ? ` — reported by ${o.reportedBy}` : '';
  return `• ${o.text.trim()}${who}${bits.length ? ` (${bits.join('; ')})` : ''}`;
}

const AREA_ORDER: InspectionArea['kind'][] = ['elevation', 'roof', 'roof_plane', 'exterior_feature', 'room', 'other'];

function areaNarratives(insp: Inspection, system: UnitSystem): string {
  const out: string[] = [];
  const areas = [...insp.areas].sort((a, b) => AREA_ORDER.indexOf(a.kind) - AREA_ORDER.indexOf(b.kind));
  for (const area of areas) {
    const obs = insp.observations.filter(
      (o) => o.areaId === area.id && ['direct_observation', 'calculation'].includes(o.kind)
    );
    const photos = insp.photos.filter((p) => p.areaId === area.id);
    out.push(`${areaLabel(insp, area.id)}`);
    if (obs.length === 0) {
      out.push('• No direct observations were recorded for this area.');
    } else {
      for (const o of obs) out.push(obsLine(insp, o, system));
    }
    if (photos.length) out.push(`  ${photoRefs(insp, photos.map((p) => p.id))} filed under this area.`);
    out.push('');
  }
  const unassigned = insp.observations.filter((o) => !o.areaId && o.kind === 'direct_observation');
  if (unassigned.length) {
    out.push('Observations not assigned to an area');
    for (const o of unassigned) out.push(obsLine(insp, o, system));
  }
  return out.join('\n').trim() || 'No inspection areas have been recorded.';
}

function measurementSummary(insp: Inspection, system: UnitSystem): string {
  const lines: string[] = [];
  if (insp.roofPlanes.length || insp.roofLines.length) {
    const s = summarizeRoof(insp.roofPlanes, insp.roofLines, insp.wasteScenarios);
    lines.push(
      `Roof: ${s.completePlanes} of ${s.planeCount} plane(s) complete. Measured roof surface area: ${fmtArea(s.totalAreaSqft, system)} (${s.totalSquares} squares).`
    );
    if (s.incompletePlanes.length) {
      lines.push(`  Incomplete planes (not included in the total): ${s.incompletePlanes.map((p) => `${p.name} — missing ${p.missing.join(', ')}`).join('; ')}.`);
    }
    const lin = Object.entries(s.linearTotalsFt).filter(([, v]) => v > 0);
    if (lin.length) lines.push(`  Linear features: ${lin.map(([k, v]) => `${k} ${fmtLengthFt(v, system)}`).join(', ')}.`);
    if (s.wasteScenarios.length) {
      lines.push(
        `  Estimated material quantities with waste allowance (not measured values): ${s.wasteScenarios.map((w) => `${w.percent}% → ${fmtArea(w.areaSqft, system)}`).join('; ')}.`
      );
    }
  }
  for (const room of insp.rooms) {
    const c = calcRoom(room);
    const f = c.floorSqft !== null ? fmtArea(c.floorSqft, system) : 'incomplete';
    const w = c.adjustedWallSqft !== null ? fmtArea(c.adjustedWallSqft, system) : 'incomplete';
    lines.push(
      `${room.name}${room.level ? ` (${room.level})` : ''}: floor/ceiling ${f}, adjusted wall ${w} [${VALUE_SOURCE_LABELS[room.source].toLowerCase()}]${c.missing.length ? ` — missing ${c.missing.join(', ')}` : ''}.`
    );
  }
  return lines.join('\n') || 'No measurements have been recorded.';
}

function listByKind(insp: Inspection, kind: Observation['kind'], system: UnitSystem, empty: string): string {
  const obs = insp.observations.filter((o) => o.kind === kind);
  if (!obs.length) return empty;
  return obs.map((o) => `${o.areaId ? `${areaLabel(insp, o.areaId)}: ` : ''}${obsLine(insp, o, system).slice(2)}`).map((l) => `• ${l}`).join('\n');
}

export function buildDamageTable(insp: Inspection, system: UnitSystem): DamageRow[] {
  return insp.observations
    .filter((o) => o.condition === 'damage_observed')
    .map((o) => ({
      observationId: o.id,
      location: areaLabel(insp, o.areaId),
      component: o.component || '—',
      condition: o.text.trim(),
      dimensions:
        o.measurementIds
          .map((m) => describeMeasurement(insp, m, system))
          .filter(Boolean)
          .join('; ') || 'Not recorded',
      photos: photoRefs(insp, o.photoIds) || 'None linked',
      notes: `${OBSERVATION_KIND_LABELS[o.kind]}${o.reportedBy ? ` (${o.reportedBy})` : ''}`
    }));
}

function overview(insp: Inspection, inspector: string): string {
  const p = insp.property;
  const address = [p.addressLine, p.city, p.state, p.postalCode].filter(Boolean).join(', ') || 'Not recorded';
  return [
    `Claim / inspection reference: ${insp.claimNumber || 'Not recorded'}`,
    `Property: ${address}`,
    `Insured / contact: ${p.insuredName || 'Not recorded'}`,
    `Property type: ${PROPERTY_TYPE_LABELS[p.propertyType]}${p.stories ? `, ${p.stories} stor${p.stories === '1' ? 'y' : 'ies'}` : ''}${p.yearBuilt ? `, built ${p.yearBuilt}` : ''}`,
    `Roof covering (as recorded): ${p.roofCovering || 'Not recorded'}`,
    `Reported loss type(s): ${insp.lossTypes.map((l) => LOSS_TYPE_LABELS[l]).join(', ') || 'Not recorded'}`,
    `Reported date of loss: ${insp.reportedLossDate || 'Not recorded'}`,
    `Inspection date: ${insp.inspectionDate || 'Not recorded'}`,
    `Inspector: ${inspector || 'Not recorded'}`,
    `Workflow status: ${INSPECTION_STATUS_LABELS[insp.status]}`
  ].join('\n');
}

function scope(insp: Inspection): string {
  const lines: string[] = [];
  for (const s of insp.structures) {
    const areas = insp.areas.filter((a) => a.structureId === s.id);
    lines.push(`${s.name}: ${areas.length ? areas.map((a) => a.name).join(', ') : 'no areas recorded'}`);
  }
  lines.push(`Photographs recorded: ${insp.photos.length}. Observations recorded: ${insp.observations.length}.`);
  return lines.join('\n');
}

function gapsAndFollowUp(insp: Inspection): string {
  const lines: string[] = [];
  const open = insp.followUps.filter((f) => f.status === 'open');
  for (const f of open) lines.push(`• Follow-up: ${f.title}${f.dueDate ? ` (due ${f.dueDate})` : ''}`);
  for (const g of findGaps(insp).filter((g) => g.category !== 'reviews')) lines.push(`• Gap: ${g.message}`);
  return lines.join('\n') || 'No outstanding follow-up items or documentation gaps were identified.';
}

export interface GenerateOptions {
  inspectorName: string;
  unitSystem: UnitSystem;
}

export function generateSections(insp: Inspection, opts: GenerateOptions): { key: string; title: string; body: string }[] {
  const sys = opts.unitSystem;
  return [
    { key: 'overview', title: 'Inspection overview', body: overview(insp, opts.inspectorName) },
    { key: 'scope', title: 'Areas inspected', body: scope(insp) },
    {
      key: 'reported',
      title: 'Reported statements',
      body: listByKind(insp, 'reported_statement', sys, 'No reported statements were recorded.')
    },
    { key: 'observations', title: 'Observations by area', body: areaNarratives(insp, sys) },
    { key: 'measurements', title: 'Measurement summary', body: measurementSummary(insp, sys) },
    {
      key: 'assumptions',
      title: 'Assumptions and calculations',
      body: [
        listByKind(insp, 'assumption', sys, 'No assumptions were recorded.'),
        insp.observations.some((o) => o.kind === 'calculation') ? listByKind(insp, 'calculation', sys, '') : ''
      ]
        .filter(Boolean)
        .join('\n')
    },
    {
      key: 'interpretations',
      title: 'Preliminary interpretations (require review)',
      body: listByKind(insp, 'preliminary_interpretation', sys, 'No preliminary interpretations were recorded.')
    },
    {
      key: 'questions',
      title: 'Unresolved questions',
      body: listByKind(insp, 'unresolved_question', sys, 'No unresolved questions were recorded.')
    },
    { key: 'gaps', title: 'Missing information and follow-up actions', body: gapsAndFollowUp(insp) },
    { key: 'limitations', title: 'Limitations', body: LIMITATIONS_TEXT }
  ];
}

/**
 * Create a new report version. Sections the user edited in the previous version
 * keep their edited text; if the underlying data changed since, the section is
 * flagged so the user can compare.
 */
export function generateReport(insp: Inspection, opts: GenerateOptions): Report {
  const now = nowIso();
  const prev = [...insp.reports].sort((a, b) => b.version - a.version)[0];
  const sections: ReportSection[] = generateSections(insp, opts).map((s) => {
    const old = prev?.sections.find((x) => x.key === s.key);
    if (old && old.edited) {
      return {
        id: newId('sec'),
        key: s.key,
        title: s.title,
        body: old.body,
        generatedBody: s.body,
        edited: true,
        approved: false,
        sourceChanged: old.generatedBody !== s.body || old.sourceChanged
      };
    }
    return { id: newId('sec'), key: s.key, title: s.title, body: s.body, generatedBody: s.body, edited: false, approved: false, sourceChanged: false };
  });
  return {
    id: newId('rpt'),
    title: `Inspection report — ${insp.claimNumber || insp.title}`,
    status: 'draft',
    version: (prev?.version ?? 0) + 1,
    sections,
    damageTable: buildDamageTable(insp, opts.unitSystem),
    issues: findConsistencyIssues(insp),
    sourceRecordIds: {
      observations: insp.observations.map((o) => o.id),
      photos: insp.photos.map((p) => p.id),
      measurements: [...insp.roofPlanes.map((p) => p.id), ...insp.roofLines.map((l) => l.id), ...insp.rooms.map((r) => r.id)]
    },
    generatedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

/** True when records used by the report have changed since it was generated. */
export function reportIsOutdated(insp: Inspection, report: Report): boolean {
  const ids = [
    ...insp.observations.map((o) => [o.id, o.updatedAt] as const),
    ...insp.roofPlanes.map((p) => [p.id, p.updatedAt] as const),
    ...insp.roofLines.map((l) => [l.id, l.updatedAt] as const),
    ...insp.rooms.map((r) => [r.id, r.updatedAt] as const),
    ...insp.photos.map((p) => [p.id, p.updatedAt] as const)
  ];
  const src = new Set([
    ...report.sourceRecordIds.observations,
    ...report.sourceRecordIds.photos,
    ...report.sourceRecordIds.measurements
  ]);
  if (ids.length !== src.size) return true;
  return ids.some(([id, updated]) => !src.has(id) || updated > report.generatedAt);
}
