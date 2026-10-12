/**
 * Inspection Record Manager — factories and lifecycle helpers for the shared
 * Inspection aggregate. Persistence lives in ../data; this file is pure.
 */
import {
  type Inspection,
  type InspectionArea,
  type LossType,
  type Settings,
  type Structure,
  type AreaKind,
  SCHEMA_VERSION
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { buildChecklist, DEFAULT_CHECKLIST_TEMPLATE, DEFAULT_PHOTO_REQUIREMENTS } from './checklists';

export interface NewInspectionInput {
  claimNumber: string;
  title?: string;
  lossTypes: LossType[];
  reportedLossDate?: string;
  inspectionDate?: string;
  insuredName?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType?: Inspection['property']['propertyType'];
}

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    unitSystem: 'imperial',
    defaultWasteScenarios: [10, 15],
    inspectorName: '',
    checklistTemplate: DEFAULT_CHECKLIST_TEMPLATE.map((i) => ({ ...i })),
    defaultPhotoRequirements: { ...DEFAULT_PHOTO_REQUIREMENTS },
    acknowledgedDataNotice: false,
    updatedAt: nowIso()
  };
}

export function createStructure(name: string, description = ''): Structure {
  return { id: newId('str'), name, description };
}

export function createArea(
  structureId: string,
  kind: AreaKind,
  name: string,
  settings: Pick<Settings, 'defaultPhotoRequirements'>,
  level = ''
): InspectionArea {
  const now = nowIso();
  return {
    id: newId('area'),
    structureId,
    kind,
    name,
    level,
    notes: '',
    photoRequirements: [...(settings.defaultPhotoRequirements[kind] ?? [])],
    createdAt: now,
    updatedAt: now
  };
}

export function createInspection(input: NewInspectionInput, settings: Settings): Inspection {
  const now = nowIso();
  const main = createStructure('Main dwelling');
  const lossTypes = input.lossTypes.length ? input.lossTypes : [];
  const areas: InspectionArea[] = [];
  const needsExterior = lossTypes.some((l) => ['wind', 'hail', 'roof', 'exterior', 'fire'].includes(l));
  const needsRoof = lossTypes.some((l) => ['wind', 'hail', 'roof'].includes(l));
  if (needsExterior) {
    for (const e of ['Front elevation', 'Right elevation', 'Rear elevation', 'Left elevation']) {
      areas.push(createArea(main.id, 'elevation', e, settings));
    }
  }
  if (needsRoof) areas.push(createArea(main.id, 'roof', 'Roof', settings));

  return {
    id: newId('insp'),
    schemaVersion: SCHEMA_VERSION,
    claimNumber: input.claimNumber.trim(),
    title: input.title?.trim() || `${input.claimNumber.trim()} inspection`,
    status: 'scheduled',
    isDemo: false,
    lossTypes,
    reportedLossDate: input.reportedLossDate ?? '',
    inspectionDate: input.inspectionDate ?? '',
    property: {
      insuredName: input.insuredName ?? '',
      addressLine: input.addressLine ?? '',
      city: input.city ?? '',
      state: input.state ?? '',
      postalCode: input.postalCode ?? '',
      propertyType: input.propertyType ?? 'single_family',
      yearBuilt: '',
      stories: '',
      roofCovering: '',
      notes: ''
    },
    structures: [main],
    areas,
    checklist: buildChecklist(settings.checklistTemplate, lossTypes),
    observations: [],
    roofPlanes: [],
    roofLines: [],
    rooms: [],
    wasteScenarios: [...settings.defaultWasteScenarios],
    photos: [],
    annotations: [],
    reports: [],
    estimate: null,
    findings: [],
    followUps: [],
    history: [{ at: now, action: 'Inspection created' }],
    reviews: { finalReviewNote: '' },
    createdAt: now,
    updatedAt: now
  };
}

export function addHistory(insp: Inspection, action: string): void {
  insp.history.push({ at: nowIso(), action });
  if (insp.history.length > 500) insp.history.splice(0, insp.history.length - 500);
}

export function areaLabel(insp: Inspection, areaId: string | undefined): string {
  if (!areaId) return 'Unassigned';
  const a = insp.areas.find((x) => x.id === areaId);
  if (!a) return 'Unknown area';
  const s = insp.structures.find((x) => x.id === a.structureId);
  const structure = s && insp.structures.length > 1 ? `${s.name} › ` : '';
  return `${structure}${a.name}${a.level ? ` (${a.level})` : ''}`;
}

export function photoNumber(insp: Inspection, photoId: string): number {
  return insp.photos.findIndex((p) => p.id === photoId) + 1;
}

/** Fresh default template list used when Settings has none yet. */
export { DEFAULT_CHECKLIST_TEMPLATE };
