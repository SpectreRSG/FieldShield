/**
 * Configurable checklist templates. The defaults below are suggestions only:
 * every item starts as optional, can be disabled in Settings, and can be marked
 * "not applicable" on any inspection. Nothing here implies a mandatory step.
 */
import type {
  AreaKind,
  ChecklistItem,
  ChecklistTemplateItem,
  LossType,
  ShotType
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';

const t = (
  id: string,
  phase: ChecklistTemplateItem['phase'],
  text: string,
  lossTypes: LossType[] = [],
  guidance = ''
): ChecklistTemplateItem => ({ id, phase, text, lossTypes, guidance, enabled: true });

export const DEFAULT_CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  // Pre-inspection
  t('pre-assignment', 'pre_inspection', 'Review assignment details and reported loss description'),
  t('pre-contact', 'pre_inspection', 'Confirm appointment time and access with the contact'),
  t('pre-weather', 'pre_inspection', 'Review weather or event information for the reported date of loss', ['wind', 'hail'],
    'Record the source used; do not treat weather data as proof of damage.'),
  t('pre-safety', 'pre_inspection', 'Check safety equipment (ladder, harness, PPE, flashlight)'),
  t('pre-roof-safety', 'pre_inspection', 'Plan roof access and fall protection', ['wind', 'hail', 'roof']),
  t('pre-moisture', 'pre_inspection', 'Pack and test moisture meter', ['water', 'plumbing_water']),
  t('pre-device', 'pre_inspection', 'Charge device, clear storage space and confirm FieldShield works offline'),
  t('pre-prior', 'pre_inspection', 'Review any prior inspection notes for this property, if available'),

  // Field
  t('fld-arrival', 'field', 'Take address / front elevation overview photographs'),
  t('fld-interview', 'field', 'Record reported statements and who made them'),
  t('fld-elevations', 'field', 'Walk and photograph all elevations', ['wind', 'hail', 'exterior', 'roof', 'fire']),
  t('fld-collateral', 'field', 'Inspect collateral items (gutters, downspouts, siding, screens, AC fins)', ['hail', 'wind']),
  t('fld-roof-measure', 'field', 'Measure roof planes, pitch and linear features', ['wind', 'hail', 'roof']),
  t('fld-roof-test', 'field', 'Document roof test areas with overview, context and close-up photos', ['hail', 'wind', 'roof']),
  t('fld-roof-age', 'field', 'Record roof covering type, layers and visible condition', ['wind', 'hail', 'roof']),
  t('fld-water-source', 'field', 'Document the reported water source and current status', ['water', 'plumbing_water'],
    'Record what was observed versus what was reported.'),
  t('fld-moisture-map', 'field', 'Record moisture readings and affected extent', ['water', 'plumbing_water']),
  t('fld-plumbing', 'field', 'Photograph the plumbing component involved, if accessible', ['plumbing_water']),
  t('fld-fire-origin', 'field', 'Document affected areas and visible fire damage extent', ['fire']),
  t('fld-smoke', 'field', 'Document smoke / soot deposits room by room', ['smoke', 'fire']),
  t('fld-rooms', 'field', 'Measure affected rooms (length, width, ceiling height, openings)', ['water', 'plumbing_water', 'fire', 'smoke', 'interior']),
  t('fld-interior-photos', 'field', 'Photograph each affected room (overview and close-ups)', ['water', 'plumbing_water', 'fire', 'smoke', 'interior']),
  t('fld-exterior', 'field', 'Inspect exterior components related to the reported loss', ['exterior']),
  t('fld-unrelated', 'field', 'Note pre-existing or unrelated conditions observed, without drawing conclusions'),

  // Departure
  t('dep-photos', 'departure', 'Confirm photo coverage for every inspected area'),
  t('dep-measure', 'departure', 'Confirm all needed measurements were captured'),
  t('dep-questions', 'departure', 'Review unresolved questions before leaving the site'),
  t('dep-explain', 'departure', 'Explain next steps to the contact (no coverage statements)'),
  t('dep-backup', 'departure', 'Save a local backup of this inspection')
];

/** Build an inspection checklist from the (user-configurable) template for the selected loss types. */
export function buildChecklist(template: ChecklistTemplateItem[], lossTypes: LossType[]): ChecklistItem[] {
  const now = nowIso();
  return template
    .filter((tpl) => tpl.enabled)
    .filter((tpl) => tpl.lossTypes.length === 0 || tpl.lossTypes.some((l) => lossTypes.includes(l)))
    .map((tpl) => ({
      id: newId('chk'),
      phase: tpl.phase,
      text: tpl.text,
      guidance: tpl.guidance,
      status: 'not_started' as const,
      required: false,
      note: '',
      origin: tpl.id,
      createdAt: now,
      updatedAt: now
    }));
}

/** Add template items for newly selected loss types without disturbing existing progress. */
export function mergeChecklist(
  existing: ChecklistItem[],
  template: ChecklistTemplateItem[],
  lossTypes: LossType[]
): ChecklistItem[] {
  const have = new Set(existing.map((i) => i.origin));
  const additions = buildChecklist(template, lossTypes).filter((i) => !have.has(i.origin));
  return [...existing, ...additions];
}

export const DEFAULT_PHOTO_REQUIREMENTS: Record<AreaKind, ShotType[]> = {
  elevation: ['overview', 'closeup'],
  roof: ['overview'],
  roof_plane: ['overview', 'context', 'closeup'],
  room: ['overview', 'closeup'],
  exterior_feature: ['context', 'closeup'],
  other: []
};

export interface ChecklistProgress {
  total: number;
  applicable: number;
  completed: number;
  followUp: number;
  inProgress: number;
  percent: number;
}

/** Completion excludes "not applicable" items so optional steps never count against the user. */
export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  const applicable = items.filter((i) => i.status !== 'not_applicable');
  const completed = applicable.filter((i) => i.status === 'completed').length;
  return {
    total: items.length,
    applicable: applicable.length,
    completed,
    followUp: items.filter((i) => i.status === 'follow_up').length,
    inProgress: items.filter((i) => i.status === 'in_progress').length,
    percent: applicable.length === 0 ? 100 : Math.round((completed / applicable.length) * 100)
  };
}
