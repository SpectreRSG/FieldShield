/**
 * Fictional demonstration inspection. Every name, address, claim number and
 * photograph is synthetic. Some documentation and estimate problems are seeded
 * on purpose so the completeness and quality-control checks have something to find.
 */
import type { Inspection, Observation, Photo, RoofLine, RoofPlane, RoomMeasurement, Settings, ShotType } from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { createArea, createInspection } from './inspectionRecord';
import { applyMapping, guessMapping, parseCsv } from './estimateImport';
import { newPhotoRecord } from './photos';

export const DEMO_ESTIMATE_CSV = `Line,Description,Qty,Unit,Unit Price,Total,Room
1,Remove laminated comp. shingle roofing,20.1,SQ,62.00,1246.20,Roof
2,Laminated comp. shingle roofing - w/out felt,26,SQ,268.00,6868.00,Roof
3,Drip edge,170,LF,3.10,527.00,Roof
4,Hip / Ridge cap - composition shingles,66,LF,8.25,544.50,Roof
5,Drywall - ceiling - hung taped floated,168,SF,2.85,478.80,Kitchen
6,Paint the walls - two coats,460,SF,1.05,483.00,Kitchen
7,Paint the walls - two coats,460,SF,1.05,483.00,Kitchen
8,Carpet - Living room,280,SF,4.25,1190.00,Living room
`;

/** Description of each synthetic photo; the image itself is drawn by demoImages.ts. */
export interface DemoPhotoSpec {
  scene: 'house' | 'house-rear' | 'roof' | 'roof-test' | 'hail-hit' | 'gutter' | 'kitchen' | 'stain' | 'screen' | 'house-left';
  areaName: string;
  shot: ShotType;
  caption: string;
  component: string;
  fileName: string;
  pendingSuggestion?: boolean;
}

export const DEMO_PHOTOS: DemoPhotoSpec[] = [
  { scene: 'house', areaName: 'Front elevation', shot: 'overview', caption: 'Front elevation overview with address marker', component: 'Elevation', fileName: 'front_overview.jpg' },
  { scene: 'house-left', areaName: 'Left elevation', shot: 'overview', caption: 'Left elevation overview', component: 'Elevation', fileName: 'left_overview.jpg' },
  { scene: 'house-rear', areaName: 'Rear elevation', shot: 'overview', caption: 'Rear elevation overview', component: 'Elevation', fileName: 'rear_overview.jpg' },
  { scene: 'gutter', areaName: 'Rear elevation', shot: 'closeup', caption: 'Rear gutter — dents along front face', component: 'Gutter', fileName: 'rear_gutter_close.jpg' },
  { scene: 'screen', areaName: 'Right elevation', shot: 'closeup', caption: 'Right elevation window screen', component: 'Window / screen', fileName: 'right_screen_close.jpg' },
  { scene: 'roof', areaName: 'Roof', shot: 'overview', caption: 'Roof overview from front', component: 'Roof covering', fileName: 'roof_overview.jpg' },
  { scene: 'roof-test', areaName: 'Front slope', shot: 'context', caption: 'Front slope test square (10 ft × 10 ft) marked in chalk', component: 'Roof covering', fileName: 'front_slope_test_square.jpg' },
  { scene: 'hail-hit', areaName: 'Front slope', shot: 'closeup', caption: 'Front slope — circular mark on shingle, chalk circled', component: 'Roof covering', fileName: 'front_slope_close.jpg' },
  { scene: 'kitchen', areaName: 'Kitchen', shot: 'overview', caption: 'Kitchen overview', component: 'Room', fileName: 'kitchen_overview.jpg' },
  // Seeded: no caption and an unconfirmed automatic suggestion.
  { scene: 'stain', areaName: 'Kitchen', shot: 'closeup', caption: '', component: 'Ceiling', fileName: 'kitchen_ceiling_close.jpg', pendingSuggestion: true }
];

const dim = (value: number) => ({ value, unit: 'ft' as const });

export function buildDemoInspection(settings: Settings): Inspection {
  const insp = createInspection(
    {
      claimNumber: 'FS-DEMO-0001',
      title: 'Demo — hail, wind and roof-leak inspection',
      lossTypes: ['hail', 'wind', 'water'],
      reportedLossDate: '2026-09-21',
      inspectionDate: '2026-10-02',
      insuredName: 'Alex Example (fictional)',
      addressLine: '100 Sample Street',
      city: 'Testville',
      state: 'ST',
      postalCode: '00000',
      propertyType: 'single_family'
    },
    settings
  );
  const now = nowIso();
  insp.isDemo = true;
  insp.status = 'in_progress';
  insp.property.yearBuilt = '2004';
  insp.property.stories = '1';
  insp.property.roofCovering = 'Laminated composition shingles, one layer (as observed)';
  insp.property.notes = 'Fictional property used for demonstration and testing only.';
  const main = insp.structures[0];
  const garage = { id: newId('str'), name: 'Detached garage', description: 'Fictional single-car garage — not inspected in this demo' };
  insp.structures.push(garage);

  const area = (name: string) => insp.areas.find((a) => a.name === name)!;
  insp.areas.push(
    createArea(main.id, 'roof_plane', 'Front slope', settings),
    createArea(main.id, 'roof_plane', 'Rear slope', settings),
    createArea(main.id, 'room', 'Kitchen', settings, 'Level 1'),
    createArea(main.id, 'room', 'Living room', settings, 'Level 1')
  );

  // Checklist progress — a realistic mid-inspection state.
  for (const item of insp.checklist) {
    if (item.phase === 'pre_inspection') item.status = 'completed';
    if (['fld-arrival', 'fld-interview', 'fld-elevations', 'fld-roof-measure', 'fld-rooms'].includes(item.origin)) item.status = 'completed';
    if (item.origin === 'fld-roof-test') item.status = 'in_progress';
    if (item.origin === 'fld-moisture-map') {
      item.status = 'follow_up';
      item.note = 'Moisture meter battery failed — readings not taken.';
    }
  }
  insp.reviews.preInspectionCompletedAt = now;

  // Measurements.
  const plane = (name: string, shape: RoofPlane['shape'], L?: number, W?: number, areaName?: string, pitch = 6): RoofPlane => ({
    id: newId('roof'),
    areaId: areaName ? area(areaName).id : undefined,
    name,
    shape,
    length: L === undefined ? undefined : dim(L),
    width: W === undefined ? undefined : dim(W),
    pitchRise: pitch,
    dimensionBasis: 'slope',
    source: 'measured',
    notes: '',
    revisions: [],
    createdAt: now,
    updatedAt: now
  });
  const front = plane('Front slope', 'rectangle', 50, 18, 'Front slope');
  const rear = plane('Rear slope', 'rectangle', 50, 18, 'Rear slope');
  const leftHip = plane('Left hip end', 'triangle', 30, 14);
  // Seeded gap: height not recorded.
  const rightHip = plane('Right hip end', 'triangle', 30, undefined);
  insp.roofPlanes = [front, rear, leftHip, rightHip];
  const line = (kind: RoofLine['kind'], len: number): RoofLine => ({
    id: newId('rl'), kind, length: dim(len), source: 'measured', notes: '', revisions: [], createdAt: now, updatedAt: now
  });
  insp.roofLines = [line('eave', 50), line('eave', 50), line('eave', 30), line('eave', 30), line('ridge', 20), line('hip', 22), line('hip', 22)];

  const kitchen: RoomMeasurement = {
    id: newId('room'),
    areaId: area('Kitchen').id,
    name: 'Kitchen',
    level: 'Level 1',
    length: dim(14),
    width: dim(12),
    height: dim(8),
    segments: [],
    openings: [
      { id: newId('op'), kind: 'door', width: dim(3), height: { value: 80, unit: 'in' }, quantity: 1 },
      { id: newId('op'), kind: 'window', width: dim(4), height: { value: 42, unit: 'in' }, quantity: 1 }
    ],
    source: 'measured',
    notes: '',
    revisions: [],
    createdAt: now,
    updatedAt: now
  };
  const living: RoomMeasurement = {
    id: newId('room'),
    areaId: area('Living room').id,
    name: 'Living room',
    level: 'Level 1',
    length: dim(18),
    width: dim(15),
    // Seeded gap: ceiling height not recorded.
    segments: [],
    openings: [],
    source: 'estimated',
    notes: 'Paced off — tape measure not used.',
    revisions: [],
    createdAt: now,
    updatedAt: now
  };
  insp.rooms = [kitchen, living];

  // Photos (metadata — the synthetic images are rendered separately).
  const photos: Photo[] = DEMO_PHOTOS.map((spec, i) => {
    const a = area(spec.areaName);
    const taken = new Date(Date.parse('2026-10-02T14:05:00Z') + i * 90_000).toISOString();
    const p = newPhotoRecord({
      fileName: spec.fileName,
      mimeType: 'image/jpeg',
      width: 1280,
      height: 960,
      sizeBytes: 0,
      origin: 'demo',
      capturedAt: taken,
      importedAt: now,
      structureId: main.id,
      areaId: spec.pendingSuggestion ? undefined : a.id,
      shotType: spec.pendingSuggestion ? 'other' : spec.shot,
      caption: spec.caption,
      component: spec.pendingSuggestion ? '' : spec.component,
      labels: ['synthetic']
    });
    if (spec.pendingSuggestion) {
      p.suggestion = {
        areaId: a.id,
        shotType: spec.shot,
        component: spec.component,
        reason: 'Suggested because file name mentions "kitchen" and "ceiling".',
        status: 'pending'
      };
    }
    return p;
  });
  insp.photos = photos;
  const ph = (fileName: string) => photos.find((p) => p.fileName === fileName)!.id;

  const obs = (o: Partial<Observation> & Pick<Observation, 'text' | 'kind'>): Observation => ({
    id: newId('obs'),
    component: '',
    condition: 'not_assessed',
    reportedBy: '',
    inputMethod: 'typed',
    photoIds: [],
    measurementIds: [],
    createdAt: now,
    updatedAt: now,
    ...o
  });
  insp.observations = [
    obs({ kind: 'reported_statement', text: 'Insured reported hearing hail for about 10 minutes on the evening of the reported loss date.', reportedBy: 'Insured (fictional)', areaId: area('Roof').id }),
    obs({ kind: 'reported_statement', text: 'Insured reported a brown stain appearing on the kitchen ceiling two days after the storm.', reportedBy: 'Insured (fictional)', areaId: area('Kitchen').id, condition: 'damage_observed', damageCategory: 'water' }),
    obs({ kind: 'direct_observation', text: 'Front elevation siding and windows: no visible dents, cracks or tears.', areaId: area('Front elevation').id, component: 'Siding', condition: 'no_damage_observed', photoIds: [ph('front_overview.jpg')] }),
    obs({ kind: 'direct_observation', text: 'Left elevation siding: no visible damage.', areaId: area('Left elevation').id, component: 'Siding', condition: 'no_damage_observed', photoIds: [ph('left_overview.jpg')] }),
    obs({ kind: 'direct_observation', text: 'Rear gutter has multiple dents along the front face.', areaId: area('Rear elevation').id, component: 'Gutter', condition: 'damage_observed', damageCategory: 'hail', photoIds: [ph('rear_gutter_close.jpg')] }),
    // Seeded contradiction: same component recorded as both damaged and undamaged.
    obs({ kind: 'direct_observation', text: 'Window screen on right elevation: no tears observed.', areaId: area('Right elevation').id, component: 'Window screen', condition: 'no_damage_observed' }),
    obs({ kind: 'direct_observation', text: 'Window screen on right elevation has a small tear near the lower corner.', areaId: area('Right elevation').id, component: 'Window screen', condition: 'damage_observed', damageCategory: 'wind', photoIds: [ph('right_screen_close.jpg')] }),
    obs({ kind: 'direct_observation', text: 'Roof covering is laminated composition shingle, one layer, granule loss visible at several locations.', areaId: area('Roof').id, component: 'Roof covering', condition: 'damage_observed', damageCategory: 'hail', photoIds: [ph('roof_overview.jpg')], measurementIds: [front.id, rear.id] }),
    // Seeded unsupported conclusion: cause language inside a direct observation.
    obs({ kind: 'direct_observation', text: 'Front slope test square: 9 circular marks with granule displacement caused by hail.', areaId: area('Front slope').id, component: 'Roof covering', condition: 'damage_observed', damageCategory: 'hail', photoIds: [ph('front_slope_test_square.jpg'), ph('front_slope_close.jpg')], measurementIds: [front.id] }),
    obs({ kind: 'direct_observation', text: 'Rear slope: no marks found in test area.', areaId: area('Rear slope').id, component: 'Roof covering', condition: 'no_damage_observed', measurementIds: [rear.id] }),
    obs({ kind: 'direct_observation', text: 'Kitchen ceiling has a brown ring-shaped stain approximately 3 ft by 2 ft near the exterior wall.', areaId: area('Kitchen').id, component: 'Ceiling drywall', condition: 'damage_observed', damageCategory: 'water', photoIds: [ph('kitchen_overview.jpg')], measurementIds: [kitchen.id] }),
    obs({ kind: 'direct_observation', text: 'Living room ceiling: no staining observed at the time of inspection.', areaId: area('Living room').id, component: 'Ceiling', condition: 'no_damage_observed' }),
    obs({ kind: 'preliminary_interpretation', text: 'Kitchen ceiling stain location may correspond to the roof area above the front slope.', areaId: area('Kitchen').id }),
    obs({ kind: 'assumption', text: 'Living room dimensions are paced estimates; ceiling height assumed similar to kitchen but not measured.', areaId: area('Living room').id }),
    obs({ kind: 'unresolved_question', text: 'Was the attic accessible above the kitchen? Attic not entered during this visit.', areaId: area('Kitchen').id })
  ];

  insp.followUps = [
    { id: newId('fu'), title: 'Return with working moisture meter for kitchen readings', detail: '', status: 'open', dueDate: '2026-10-09', createdAt: now, updatedAt: now },
    { id: newId('fu'), title: 'Measure right hip end height', detail: 'Height of right hip triangle not recorded.', status: 'open', dueDate: '', relatedId: rightHip.id, createdAt: now, updatedAt: now }
  ];

  // Estimate created through the same import path a user would use.
  const parsed = parseCsv(DEMO_ESTIMATE_CSV);
  const mapped = applyMapping(parsed, guessMapping(parsed.headers), insp);
  insp.estimate = {
    id: newId('est'),
    name: 'Demo estimate (fictional, imported from CSV)',
    source: 'csv_import',
    importedFileName: 'demo-estimate.csv',
    statedTotal: 11820.5,
    lines: mapped.lines,
    createdAt: now,
    updatedAt: now
  };
  insp.history.push({ at: now, action: 'Demonstration data loaded (fictional)' });
  return insp;
}
