/** The 13-step integrated inspection workflow and how far an inspection has progressed. */
import type { Inspection } from '../domain/models';
import { findConsistencyIssues, findGaps, latestReport } from './validation';

export interface WorkflowStep {
  n: number;
  label: string;
  done: boolean;
  module: 'mission' | 'measure' | 'photos' | 'notes' | 'qc' | 'export';
  tab?: string;
}

export function workflowSteps(insp: Inspection): WorkflowStep[] {
  const gaps = findGaps(insp);
  const report = latestReport(insp);
  const field = insp.checklist.filter((c) => c.phase === 'field');
  const fieldTouched = field.some((c) => c.status !== 'not_started');
  const linked = insp.observations.some((o) => o.photoIds.length > 0 || o.measurementIds.length > 0);
  const activeFindings = insp.findings.filter((f) => !f.stale);
  return [
    { n: 1, label: 'Create the inspection', done: true, module: 'mission', tab: 'overview' },
    { n: 2, label: 'Complete pre-inspection preparation', done: !!insp.reviews.preInspectionCompletedAt, module: 'mission', tab: 'checklist' },
    { n: 3, label: 'Conduct the field inspection (checklist)', done: fieldTouched && field.every((c) => c.status !== 'not_started'), module: 'mission', tab: 'checklist' },
    { n: 4, label: 'Record observations and dimensions', done: insp.observations.length > 0 && (insp.roofPlanes.length + insp.rooms.length > 0), module: 'notes' },
    { n: 5, label: 'Capture and organise photographs', done: insp.photos.length > 0 && insp.photos.every((p) => !!p.areaId), module: 'photos' },
    { n: 6, label: 'Link evidence to findings', done: linked, module: 'notes' },
    { n: 7, label: 'Run completeness and consistency checks', done: gaps.filter((g) => g.severity === 'gap').length === 0 && findConsistencyIssues(insp).filter((i) => i.severity === 'contradiction').length === 0, module: 'mission', tab: 'gaps' },
    { n: 8, label: 'Generate a draft report', done: !!report, module: 'notes', tab: 'report' },
    { n: 9, label: 'Enter or import estimate data', done: !!insp.estimate && insp.estimate.lines.length > 0, module: 'qc' },
    { n: 10, label: 'Run estimate quality-control checks', done: !!insp.qcLastRunAt, module: 'qc' },
    { n: 11, label: 'Disposition outstanding findings', done: !!insp.qcLastRunAt && activeFindings.every((f) => f.status !== 'open'), module: 'qc' },
    { n: 12, label: 'Complete final user review', done: !!insp.reviews.finalReviewCompletedAt && report?.status === 'final_reviewed', module: 'export' },
    { n: 13, label: 'Export the review package', done: !!insp.reviews.lastExportedAt, module: 'export' }
  ];
}
