/**
 * FieldShield shared data model.
 *
 * Every module (Mission Control, Measurements, Photos, Notes/Report, Estimate QC)
 * reads and writes the same `Inspection` aggregate defined here. Schemas are
 * written with zod so data restored from backups or IndexedDB is validated
 * before the application trusts it.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const LossTypeSchema = z.enum([
  'wind',
  'hail',
  'water',
  'plumbing_water',
  'fire',
  'smoke',
  'roof',
  'exterior',
  'interior'
]);
export type LossType = z.infer<typeof LossTypeSchema>;

export const LOSS_TYPE_LABELS: Record<LossType, string> = {
  wind: 'Wind',
  hail: 'Hail',
  water: 'Water',
  plumbing_water: 'Plumbing-related water',
  fire: 'Fire',
  smoke: 'Smoke',
  roof: 'Roof',
  exterior: 'Exterior',
  interior: 'Interior'
};

export const InspectionStatusSchema = z.enum(['scheduled', 'in_progress', 'in_review', 'completed']);
export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;
export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Completed'
};

export const PropertyTypeSchema = z.enum([
  'single_family',
  'townhouse',
  'condominium',
  'duplex',
  'manufactured_home',
  'other'
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  single_family: 'Single-family dwelling',
  townhouse: 'Townhouse',
  condominium: 'Condominium unit',
  duplex: 'Duplex',
  manufactured_home: 'Manufactured home',
  other: 'Other'
};

export const AreaKindSchema = z.enum(['elevation', 'roof', 'roof_plane', 'room', 'exterior_feature', 'other']);
export type AreaKind = z.infer<typeof AreaKindSchema>;
export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  elevation: 'Elevation',
  roof: 'Roof (overall)',
  roof_plane: 'Roof plane / slope',
  room: 'Room',
  exterior_feature: 'Exterior feature',
  other: 'Other location'
};

export const ChecklistStatusSchema = z.enum(['not_started', 'in_progress', 'completed', 'not_applicable', 'follow_up']);
export type ChecklistStatus = z.infer<typeof ChecklistStatusSchema>;
export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  not_applicable: 'Not applicable',
  follow_up: 'Needs follow-up'
};

export const ChecklistPhaseSchema = z.enum(['pre_inspection', 'field', 'departure']);
export type ChecklistPhase = z.infer<typeof ChecklistPhaseSchema>;
export const CHECKLIST_PHASE_LABELS: Record<ChecklistPhase, string> = {
  pre_inspection: 'Pre-inspection preparation',
  field: 'Field inspection',
  departure: 'Final departure review'
};

/** Where a number came from. Never silently upgrade an estimate to a measurement. */
export const ValueSourceSchema = z.enum(['measured', 'estimated', 'imported', 'calculated']);
export type ValueSource = z.infer<typeof ValueSourceSchema>;
export const VALUE_SOURCE_LABELS: Record<ValueSource, string> = {
  measured: 'Measured',
  estimated: 'Estimated',
  imported: 'Imported',
  calculated: 'Calculated'
};

export const LengthUnitSchema = z.enum(['ft', 'in', 'm']);
export type LengthUnit = z.infer<typeof LengthUnitSchema>;

export const UnitSystemSchema = z.enum(['imperial', 'metric']);
export type UnitSystem = z.infer<typeof UnitSystemSchema>;

export const ObservationKindSchema = z.enum([
  'direct_observation',
  'reported_statement',
  'calculation',
  'assumption',
  'preliminary_interpretation',
  'unresolved_question'
]);
export type ObservationKind = z.infer<typeof ObservationKindSchema>;
export const OBSERVATION_KIND_LABELS: Record<ObservationKind, string> = {
  direct_observation: 'Direct observation',
  reported_statement: 'Reported statement',
  calculation: 'Calculation',
  assumption: 'Assumption',
  preliminary_interpretation: 'Preliminary interpretation',
  unresolved_question: 'Unresolved question'
};

export const ConditionSchema = z.enum(['damage_observed', 'no_damage_observed', 'not_assessed']);
export type Condition = z.infer<typeof ConditionSchema>;
export const CONDITION_LABELS: Record<Condition, string> = {
  damage_observed: 'Damage observed',
  no_damage_observed: 'No damage observed',
  not_assessed: 'Not assessed / not applicable'
};

export const ShotTypeSchema = z.enum(['overview', 'context', 'closeup', 'other']);
export type ShotType = z.infer<typeof ShotTypeSchema>;
export const SHOT_TYPE_LABELS: Record<ShotType, string> = {
  overview: 'Overview',
  context: 'Context',
  closeup: 'Close-up',
  other: 'Other'
};

export const FindingStatusSchema = z.enum(['open', 'reviewed', 'resolved', 'not_applicable', 'follow_up']);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: 'Open',
  reviewed: 'Reviewed',
  resolved: 'Resolved',
  not_applicable: 'Not applicable',
  follow_up: 'Requires follow-up'
};

export const FindingRuleSchema = z.enum([
  'arithmetic_line',
  'arithmetic_total',
  'invalid_quantity',
  'potential_duplicate',
  'quantity_discrepancy',
  'missing_dimensions',
  'insufficient_documentation',
  'scope_decision'
]);
export type FindingRule = z.infer<typeof FindingRuleSchema>;

/** Confirmed arithmetic errors are kept strictly apart from potential scope concerns. */
export const FindingClassSchema = z.enum(['confirmed_arithmetic', 'potential_concern']);
export type FindingClass = z.infer<typeof FindingClassSchema>;

export const ReportStatusSchema = z.enum(['draft', 'in_review', 'final_reviewed']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  final_reviewed: 'Final review complete'
};

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** A length exactly as the user entered it (original value + original unit). */
export const DimSchema = z.object({
  value: z.number().finite().nonnegative(),
  unit: LengthUnitSchema
});
export type Dim = z.infer<typeof DimSchema>;

export const RevisionSchema = z.object({
  at: z.string(),
  field: z.string(),
  from: z.string(),
  to: z.string()
});
export type Revision = z.infer<typeof RevisionSchema>;

const Timestamps = {
  createdAt: z.string(),
  updatedAt: z.string()
};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const PropertySchema = z.object({
  insuredName: z.string().default(''),
  addressLine: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  postalCode: z.string().default(''),
  propertyType: PropertyTypeSchema.default('single_family'),
  yearBuilt: z.string().default(''),
  stories: z.string().default(''),
  roofCovering: z.string().default(''),
  notes: z.string().default('')
});
export type Property = z.infer<typeof PropertySchema>;

export const StructureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default('')
});
export type Structure = z.infer<typeof StructureSchema>;

export const InspectionAreaSchema = z.object({
  id: z.string(),
  structureId: z.string(),
  kind: AreaKindSchema,
  name: z.string(),
  level: z.string().default(''),
  notes: z.string().default(''),
  /** Configurable photo checklist for this area. Empty = no photo requirement. */
  photoRequirements: z.array(ShotTypeSchema).default([]),
  ...Timestamps
});
export type InspectionArea = z.infer<typeof InspectionAreaSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string(),
  phase: ChecklistPhaseSchema,
  text: z.string(),
  guidance: z.string().default(''),
  status: ChecklistStatusSchema,
  /** Marked by the user. Templates never force an item to be mandatory. */
  required: z.boolean().default(false),
  areaId: z.string().optional(),
  note: z.string().default(''),
  origin: z.string().default('custom'),
  ...Timestamps
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ObservationSchema = z.object({
  id: z.string(),
  areaId: z.string().optional(),
  component: z.string().default(''),
  kind: ObservationKindSchema,
  condition: ConditionSchema.default('not_assessed'),
  damageCategory: LossTypeSchema.optional(),
  text: z.string(),
  /** Who made a reported statement (e.g. "Insured (fictional)"). */
  reportedBy: z.string().default(''),
  inputMethod: z.enum(['typed', 'speech']).default('typed'),
  photoIds: z.array(z.string()).default([]),
  measurementIds: z.array(z.string()).default([]),
  ...Timestamps
});
export type Observation = z.infer<typeof ObservationSchema>;

export const RoofShapeSchema = z.enum(['rectangle', 'triangle', 'trapezoid']);
export type RoofShape = z.infer<typeof RoofShapeSchema>;

export const RoofPlaneSchema = z.object({
  id: z.string(),
  areaId: z.string().optional(),
  name: z.string(),
  shape: RoofShapeSchema,
  /** rectangle: length × width; triangle: length = base, width = height; trapezoid: length = side A, length2 = side B, width = height */
  length: DimSchema.optional(),
  length2: DimSchema.optional(),
  width: DimSchema.optional(),
  /** Rise in inches per 12 inches of run. */
  pitchRise: z.number().min(0).max(36).optional(),
  /** 'slope' = dimensions taken along the roof surface; 'plan' = horizontal (from above) dimensions. */
  dimensionBasis: z.enum(['slope', 'plan']).default('slope'),
  source: ValueSourceSchema,
  notes: z.string().default(''),
  revisions: z.array(RevisionSchema).default([]),
  ...Timestamps
});
export type RoofPlane = z.infer<typeof RoofPlaneSchema>;

export const RoofLineKindSchema = z.enum(['ridge', 'hip', 'valley', 'eave', 'rake']);
export type RoofLineKind = z.infer<typeof RoofLineKindSchema>;

export const RoofLineSchema = z.object({
  id: z.string(),
  kind: RoofLineKindSchema,
  length: DimSchema,
  roofPlaneId: z.string().optional(),
  source: ValueSourceSchema,
  notes: z.string().default(''),
  revisions: z.array(RevisionSchema).default([]),
  ...Timestamps
});
export type RoofLine = z.infer<typeof RoofLineSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  kind: z.enum(['door', 'window', 'opening']),
  width: DimSchema,
  height: DimSchema,
  quantity: z.number().int().min(1).default(1)
});
export type Opening = z.infer<typeof OpeningSchema>;

export const RoomSegmentSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  length: DimSchema,
  width: DimSchema,
  operation: z.enum(['add', 'subtract']).default('add')
});
export type RoomSegment = z.infer<typeof RoomSegmentSchema>;

export const RoomMeasurementSchema = z.object({
  id: z.string(),
  areaId: z.string().optional(),
  name: z.string(),
  level: z.string().default(''),
  length: DimSchema.optional(),
  width: DimSchema.optional(),
  height: DimSchema.optional(),
  /** Irregular rooms: extra rectangles added to / subtracted from the main rectangle. */
  segments: z.array(RoomSegmentSchema).default([]),
  /** Required for walls of irregular rooms; otherwise 2 × (L + W) is calculated. */
  perimeterOverride: DimSchema.optional(),
  openings: z.array(OpeningSchema).default([]),
  source: ValueSourceSchema,
  notes: z.string().default(''),
  revisions: z.array(RevisionSchema).default([]),
  ...Timestamps
});
export type RoomMeasurement = z.infer<typeof RoomMeasurementSchema>;

export const PhotoAnnotationShapeSchema = z.object({
  type: z.enum(['stroke', 'circle', 'arrow', 'text']),
  color: z.string(),
  /** Normalised 0..1 coordinates so annotations survive resizing. */
  points: z.array(z.tuple([z.number(), z.number()])),
  text: z.string().optional()
});

export const PhotoAnnotationSchema = z.object({
  id: z.string(),
  sourcePhotoId: z.string(),
  shapes: z.array(PhotoAnnotationShapeSchema),
  createdAt: z.string()
});
export type PhotoAnnotation = z.infer<typeof PhotoAnnotationSchema>;

export const PhotoSchema = z.object({
  id: z.string(),
  /** IndexedDB key of the stored image (originals are never modified). */
  blobKey: z.string(),
  thumbKey: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
  sizeBytes: z.number(),
  capturedAt: z.string(),
  importedAt: z.string(),
  origin: z.enum(['camera', 'import', 'demo', 'annotation']),
  isOriginal: z.boolean(),
  derivedFromId: z.string().optional(),
  annotationId: z.string().optional(),
  structureId: z.string().optional(),
  areaId: z.string().optional(),
  component: z.string().default(''),
  damageCategory: LossTypeSchema.optional(),
  shotType: ShotTypeSchema.default('other'),
  caption: z.string().default(''),
  notes: z.string().default(''),
  labels: z.array(z.string()).default([]),
  /** Automatic suggestions are shown separately until the user accepts or corrects them. */
  suggestion: z
    .object({
      areaId: z.string().optional(),
      shotType: ShotTypeSchema.optional(),
      component: z.string().optional(),
      reason: z.string(),
      status: z.enum(['pending', 'accepted', 'corrected'])
    })
    .optional(),
  ...Timestamps
});
export type Photo = z.infer<typeof PhotoSchema>;

export const ReportSectionSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  body: z.string(),
  generatedBody: z.string(),
  edited: z.boolean().default(false),
  approved: z.boolean().default(false),
  /** The user edited this section and the underlying data has since changed. */
  sourceChanged: z.boolean().default(false)
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

export const DocumentationIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['gap', 'warning', 'contradiction']),
  message: z.string(),
  relatedIds: z.array(z.string()).default([])
});
export type DocumentationIssue = z.infer<typeof DocumentationIssueSchema>;

export const DamageRowSchema = z.object({
  location: z.string(),
  component: z.string(),
  condition: z.string(),
  dimensions: z.string(),
  photos: z.string(),
  notes: z.string(),
  observationId: z.string()
});
export type DamageRow = z.infer<typeof DamageRowSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: ReportStatusSchema,
  version: z.number().int().min(1),
  sections: z.array(ReportSectionSchema),
  damageTable: z.array(DamageRowSchema).default([]),
  issues: z.array(DocumentationIssueSchema).default([]),
  /** The exact records this report was generated from. */
  sourceRecordIds: z.object({
    observations: z.array(z.string()),
    photos: z.array(z.string()),
    measurements: z.array(z.string())
  }),
  generatedAt: z.string(),
  approvedAt: z.string().optional(),
  approvedBy: z.string().optional(),
  ...Timestamps
});
export type Report = z.infer<typeof ReportSchema>;

export const EstimateLineSchema = z.object({
  id: z.string(),
  lineNo: z.string().default(''),
  description: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().default(''),
  unitPrice: z.number().nullable().default(null),
  total: z.number().nullable().default(null),
  areaId: z.string().optional(),
  component: z.string().default(''),
  source: z.enum(['manual', 'imported']),
  ...Timestamps
});
export type EstimateLine = z.infer<typeof EstimateLineSchema>;

export const EstimateSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['manual', 'csv_import']),
  importedFileName: z.string().optional(),
  statedTotal: z.number().nullable().default(null),
  lines: z.array(EstimateLineSchema),
  ...Timestamps
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const QCFindingSchema = z.object({
  id: z.string(),
  /** Deterministic key so a re-run keeps the user's disposition for the same issue. */
  key: z.string(),
  rule: FindingRuleSchema,
  classification: FindingClassSchema,
  title: z.string(),
  explanation: z.string(),
  relatedIds: z.array(z.string()).default([]),
  status: FindingStatusSchema,
  userNote: z.string().default(''),
  /** True when the latest QC run no longer reproduces this finding. */
  stale: z.boolean().default(false),
  ...Timestamps
});
export type QCFinding = z.infer<typeof QCFindingSchema>;

export const FollowUpTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string().default(''),
  status: z.enum(['open', 'done']),
  dueDate: z.string().default(''),
  relatedId: z.string().optional(),
  ...Timestamps
});
export type FollowUpTask = z.infer<typeof FollowUpTaskSchema>;

export const HistoryEntrySchema = z.object({
  at: z.string(),
  action: z.string()
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const InspectionSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int(),
  claimNumber: z.string(),
  title: z.string(),
  status: InspectionStatusSchema,
  archivedAt: z.string().optional(),
  isDemo: z.boolean().default(false),
  lossTypes: z.array(LossTypeSchema),
  reportedLossDate: z.string().default(''),
  inspectionDate: z.string().default(''),
  property: PropertySchema,
  structures: z.array(StructureSchema),
  areas: z.array(InspectionAreaSchema),
  checklist: z.array(ChecklistItemSchema),
  observations: z.array(ObservationSchema),
  roofPlanes: z.array(RoofPlaneSchema),
  roofLines: z.array(RoofLineSchema),
  rooms: z.array(RoomMeasurementSchema),
  wasteScenarios: z.array(z.number().min(0).max(100)),
  photos: z.array(PhotoSchema),
  annotations: z.array(PhotoAnnotationSchema).default([]),
  reports: z.array(ReportSchema),
  estimate: EstimateSchema.nullable(),
  findings: z.array(QCFindingSchema),
  qcLastRunAt: z.string().optional(),
  followUps: z.array(FollowUpTaskSchema),
  history: z.array(HistoryEntrySchema),
  reviews: z.object({
    preInspectionCompletedAt: z.string().optional(),
    departureReviewCompletedAt: z.string().optional(),
    finalReviewCompletedAt: z.string().optional(),
    finalReviewNote: z.string().default('')
  }),
  ...Timestamps
});
export type Inspection = z.infer<typeof InspectionSchema>;

export const ChecklistTemplateItemSchema = z.object({
  id: z.string(),
  phase: ChecklistPhaseSchema,
  text: z.string(),
  guidance: z.string().default(''),
  /** Empty = applies to every loss type. */
  lossTypes: z.array(LossTypeSchema).default([]),
  enabled: z.boolean().default(true)
});
export type ChecklistTemplateItem = z.infer<typeof ChecklistTemplateItemSchema>;

export const SettingsSchema = z.object({
  id: z.literal('settings'),
  unitSystem: UnitSystemSchema,
  defaultWasteScenarios: z.array(z.number()),
  inspectorName: z.string().default(''),
  checklistTemplate: z.array(ChecklistTemplateItemSchema),
  defaultPhotoRequirements: z.record(AreaKindSchema, z.array(ShotTypeSchema)),
  acknowledgedDataNotice: z.boolean().default(false),
  updatedAt: z.string()
});
export type Settings = z.infer<typeof SettingsSchema>;

export const TutorialIdSchema = z.enum(['mission', 'measure', 'photos', 'notes', 'qc']);
export type TutorialId = z.infer<typeof TutorialIdSchema>;

export const TutorialProgressSchema = z.object({
  id: TutorialIdSchema,
  status: z.enum(['not_started', 'in_progress', 'completed', 'skipped']),
  lastStep: z.number().int().min(0),
  updatedAt: z.string()
});
export type TutorialProgress = z.infer<typeof TutorialProgressSchema>;

/** File format for backups — validated in full before anything is restored. */
export const BackupFileSchema = z.object({
  format: z.literal('fieldshield-backup'),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  inspections: z.array(InspectionSchema),
  /** Photo binaries as data URLs keyed by blob key. */
  blobs: z.record(z.string(), z.string())
});
export type BackupFile = z.infer<typeof BackupFileSchema>;
