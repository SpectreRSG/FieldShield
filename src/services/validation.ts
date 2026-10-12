/**
 * Validation and Completeness Engine.
 *
 * Looks for documentation gaps (missing photos, measurements, notes, reviews)
 * and consistency problems (contradictions, unsupported conclusions). It only
 * reports — it never fills a gap with invented information.
 */
import type { DocumentationIssue, Inspection, Observation, ShotType } from '../domain/models';
import { SHOT_TYPE_LABELS, LOSS_TYPE_LABELS } from '../domain/models';
import { areaLabel } from './inspectionRecord';
import { calcRoom, roofPlaneArea } from './measurement';

export type GapCategory = 'photos' | 'measurements' | 'notes' | 'reviews' | 'checklist';
export type ModuleRoute = 'mission' | 'measure' | 'photos' | 'notes' | 'qc';

export interface Gap {
  key: string;
  category: GapCategory;
  severity: 'gap' | 'review';
  message: string;
  module: ModuleRoute;
  relatedIds: string[];
}

const ROOF_LOSS = ['wind', 'hail', 'roof'];
const INTERIOR_LOSS = ['water', 'plumbing_water', 'fire', 'smoke', 'interior'];

export function photosForArea(insp: Inspection, areaId: string) {
  return insp.photos.filter((p) => p.areaId === areaId);
}

export function missingShotTypes(insp: Inspection, areaId: string): ShotType[] {
  const area = insp.areas.find((a) => a.id === areaId);
  if (!area) return [];
  const have = new Set(photosForArea(insp, areaId).map((p) => p.shotType));
  return area.photoRequirements.filter((s) => !have.has(s));
}

export function findGaps(insp: Inspection): Gap[] {
  const gaps: Gap[] = [];
  const push = (g: Gap) => gaps.push(g);

  // --- Photos ---------------------------------------------------------------
  for (const area of insp.areas) {
    const missing = missingShotTypes(insp, area.id);
    if (missing.length) {
      push({
        key: `photo-req-${area.id}`,
        category: 'photos',
        severity: 'gap',
        message: `${areaLabel(insp, area.id)}: possibly missing ${missing.map((m) => SHOT_TYPE_LABELS[m].toLowerCase()).join(', ')} photo${missing.length > 1 ? 's' : ''}`,
        module: 'photos',
        relatedIds: [area.id]
      });
    }
  }
  const unassigned = insp.photos.filter((p) => !p.areaId);
  if (unassigned.length) {
    push({
      key: 'photo-unassigned',
      category: 'photos',
      severity: 'gap',
      message: `${unassigned.length} photo${unassigned.length > 1 ? 's are' : ' is'} not assigned to an inspection area`,
      module: 'photos',
      relatedIds: unassigned.map((p) => p.id)
    });
  }
  const pending = insp.photos.filter((p) => p.suggestion?.status === 'pending');
  if (pending.length) {
    push({
      key: 'photo-suggestions',
      category: 'reviews',
      severity: 'review',
      message: `${pending.length} automatic photo classification${pending.length > 1 ? 's need' : ' needs'} your confirmation`,
      module: 'photos',
      relatedIds: pending.map((p) => p.id)
    });
  }
  const noCaption = insp.photos.filter((p) => !p.caption.trim());
  if (noCaption.length) {
    push({
      key: 'photo-captions',
      category: 'photos',
      severity: 'review',
      message: `${noCaption.length} photo${noCaption.length > 1 ? 's have' : ' has'} no caption`,
      module: 'photos',
      relatedIds: noCaption.map((p) => p.id)
    });
  }

  // --- Measurements ---------------------------------------------------------
  const roofLoss = insp.lossTypes.some((l) => ROOF_LOSS.includes(l));
  if (roofLoss && insp.roofPlanes.length === 0) {
    push({
      key: 'roof-none',
      category: 'measurements',
      severity: 'gap',
      message: 'No roof planes have been measured for a roof-related loss type',
      module: 'measure',
      relatedIds: []
    });
  }
  for (const p of insp.roofPlanes) {
    const r = roofPlaneArea(p);
    if (r.missing.length) {
      push({
        key: `roof-missing-${p.id}`,
        category: 'measurements',
        severity: 'gap',
        message: `Roof plane "${p.name}" is missing: ${r.missing.join(', ')}`,
        module: 'measure',
        relatedIds: [p.id]
      });
    }
    if (p.source === 'estimated') {
      push({
        key: `roof-est-${p.id}`,
        category: 'measurements',
        severity: 'review',
        message: `Roof plane "${p.name}" uses estimated (not field-measured) dimensions`,
        module: 'measure',
        relatedIds: [p.id]
      });
    }
  }
  for (const room of insp.rooms) {
    const c = calcRoom(room);
    if (c.missing.length) {
      push({
        key: `room-missing-${room.id}`,
        category: 'measurements',
        severity: 'gap',
        message: `Room "${room.name}" is missing: ${c.missing.join(', ')}`,
        module: 'measure',
        relatedIds: [room.id]
      });
    }
    if (room.source === 'estimated') {
      push({
        key: `room-est-${room.id}`,
        category: 'measurements',
        severity: 'review',
        message: `Room "${room.name}" uses estimated (not field-measured) dimensions`,
        module: 'measure',
        relatedIds: [room.id]
      });
    }
  }
  if (insp.lossTypes.some((l) => INTERIOR_LOSS.includes(l))) {
    for (const area of insp.areas.filter((a) => a.kind === 'room')) {
      if (!insp.rooms.some((r) => r.areaId === area.id)) {
        push({
          key: `room-area-unmeasured-${area.id}`,
          category: 'measurements',
          severity: 'gap',
          message: `${areaLabel(insp, area.id)} has no room measurement`,
          module: 'measure',
          relatedIds: [area.id]
        });
      }
    }
  }

  // --- Notes / observations -------------------------------------------------
  for (const area of insp.areas) {
    if (!insp.observations.some((o) => o.areaId === area.id)) {
      push({
        key: `notes-none-${area.id}`,
        category: 'notes',
        severity: 'gap',
        message: `${areaLabel(insp, area.id)} has no recorded observations or notes`,
        module: 'notes',
        relatedIds: [area.id]
      });
    }
  }
  for (const o of insp.observations) {
    if (o.condition === 'damage_observed' && o.kind === 'direct_observation' && o.photoIds.length === 0) {
      push({
        key: `obs-nophoto-${o.id}`,
        category: 'photos',
        severity: 'gap',
        message: `Damage observation "${short(o.text)}" has no supporting photograph linked`,
        module: 'notes',
        relatedIds: [o.id]
      });
    }
    if (o.kind === 'unresolved_question') {
      push({
        key: `obs-question-${o.id}`,
        category: 'reviews',
        severity: 'review',
        message: `Unresolved question: "${short(o.text)}"`,
        module: 'notes',
        relatedIds: [o.id]
      });
    }
  }

  // --- Checklist ------------------------------------------------------------
  for (const item of insp.checklist) {
    if (item.status === 'follow_up') {
      push({
        key: `chk-follow-${item.id}`,
        category: 'checklist',
        severity: 'review',
        message: `Checklist item needs follow-up: ${item.text}`,
        module: 'mission',
        relatedIds: [item.id]
      });
    } else if (item.required && item.status !== 'completed' && item.status !== 'not_applicable') {
      push({
        key: `chk-required-${item.id}`,
        category: 'checklist',
        severity: 'gap',
        message: `Item you marked as required is not complete: ${item.text}`,
        module: 'mission',
        relatedIds: [item.id]
      });
    }
  }

  // --- Reviews --------------------------------------------------------------
  if (!insp.reviews.preInspectionCompletedAt) {
    push({ key: 'rev-pre', category: 'reviews', severity: 'review', message: 'Pre-inspection review not yet marked complete', module: 'mission', relatedIds: [] });
  }
  if (!insp.reviews.departureReviewCompletedAt) {
    push({ key: 'rev-dep', category: 'reviews', severity: 'review', message: 'Final departure review not yet marked complete', module: 'mission', relatedIds: [] });
  }
  const latest = latestReport(insp);
  if (!latest) {
    push({ key: 'rev-report-none', category: 'reviews', severity: 'review', message: 'No inspection report has been generated yet', module: 'notes', relatedIds: [] });
  } else if (latest.status !== 'final_reviewed') {
    push({ key: 'rev-report-draft', category: 'reviews', severity: 'review', message: `Report v${latest.version} is awaiting your review and approval`, module: 'notes', relatedIds: [latest.id] });
  }
  const openFindings = insp.findings.filter((f) => !f.stale && (f.status === 'open' || f.status === 'follow_up'));
  if (openFindings.length) {
    push({
      key: 'rev-qc-open',
      category: 'reviews',
      severity: 'review',
      message: `${openFindings.length} estimate quality-control finding${openFindings.length > 1 ? 's' : ''} not yet dispositioned`,
      module: 'qc',
      relatedIds: openFindings.map((f) => f.id)
    });
  }
  return gaps;
}

export function latestReport(insp: Inspection) {
  return [...insp.reports].sort((a, b) => b.version - a.version)[0];
}

function short(s: string, n = 60): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const CAUSATION = /\b(caused by|due to|result(?:ed)? of|because of|from the (?:storm|hail|wind|leak)|consistent with|attributable to)\b/i;
const COVERAGE = /\b(covered|not covered|coverage|deny|denied|approve[sd]?|settle(?:ment)?|payable|exclusion)\b/i;
const DIMENSION_TEXT = /\b\d+(?:\.\d+)?\s*(?:ft|feet|'|in|inch|inches|"|m|sq\s?ft|sf)\b/i;

/** Consistency checks used by the Report Assistant and the completeness view. */
export function findConsistencyIssues(insp: Inspection): DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];
  const add = (key: string, severity: DocumentationIssue['severity'], message: string, relatedIds: string[]) =>
    issues.push({ id: key, severity, message, relatedIds });

  // Contradictions: same area + component recorded as both damaged and undamaged.
  const groups = new Map<string, Observation[]>();
  for (const o of insp.observations) {
    if (o.kind !== 'direct_observation' || o.condition === 'not_assessed') continue;
    const k = `${o.areaId ?? '-'}|${o.component.trim().toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  for (const [k, obs] of groups) {
    const dmg = obs.filter((o) => o.condition === 'damage_observed');
    const none = obs.filter((o) => o.condition === 'no_damage_observed');
    if (dmg.length && none.length) {
      const o = obs[0];
      add(
        `contradiction-${k}`,
        'contradiction',
        `Contradiction at ${areaLabel(insp, o.areaId)}${o.component ? ` (${o.component})` : ''}: recorded both as "damage observed" and "no damage observed". Review and correct one of the entries.`,
        obs.map((x) => x.id)
      );
    }
  }

  for (const o of insp.observations) {
    if (o.kind === 'direct_observation' && CAUSATION.test(o.text)) {
      add(
        `causation-${o.id}`,
        'warning',
        `Possible unsupported conclusion: the direct observation "${short(o.text)}" includes cause language. Consider recording the cause as a preliminary interpretation.`,
        [o.id]
      );
    }
    if (o.kind === 'preliminary_interpretation' && o.photoIds.length === 0 && o.measurementIds.length === 0) {
      add(
        `interp-unsupported-${o.id}`,
        'warning',
        `Preliminary interpretation "${short(o.text)}" has no linked photographs or measurements supporting it.`,
        [o.id]
      );
    }
    if (COVERAGE.test(o.text)) {
      add(
        `coverage-${o.id}`,
        'warning',
        `"${short(o.text)}" contains coverage or settlement language. FieldShield documentation should not state coverage decisions.`,
        [o.id]
      );
    }
    if (DIMENSION_TEXT.test(o.text) && o.measurementIds.length === 0 && o.kind === 'direct_observation') {
      add(
        `dim-unlinked-${o.id}`,
        'gap',
        `"${short(o.text)}" mentions a dimension but is not linked to a recorded measurement.`,
        [o.id]
      );
    }
    if (o.damageCategory && !insp.lossTypes.includes(o.damageCategory)) {
      add(
        `losstype-${o.id}`,
        'warning',
        `Observation tagged "${LOSS_TYPE_LABELS[o.damageCategory]}" but that is not one of this inspection's reported loss types.`,
        [o.id]
      );
    }
    for (const pid of o.photoIds) {
      const p = insp.photos.find((x) => x.id === pid);
      if (!p) {
        add(`missing-photo-${o.id}-${pid}`, 'contradiction', `Observation "${short(o.text)}" links to a photo that no longer exists.`, [o.id]);
      } else if (p.areaId && o.areaId && p.areaId !== o.areaId) {
        add(
          `area-mismatch-${o.id}-${pid}`,
          'contradiction',
          `Observation at ${areaLabel(insp, o.areaId)} links photo ${insp.photos.indexOf(p) + 1}, which is filed under ${areaLabel(insp, p.areaId)}.`,
          [o.id, p.id]
        );
      }
    }
    if (
      o.condition === 'damage_observed' &&
      o.kind === 'reported_statement' &&
      !insp.observations.some(
        (x) => x.kind === 'direct_observation' && x.areaId === o.areaId && x.condition === 'damage_observed'
      )
    ) {
      add(
        `reported-damage-${o.id}`,
        'gap',
        `Reported damage "${short(o.text)}" has not been confirmed by a direct observation.`,
        [o.id]
      );
    }
  }
  return issues;
}
