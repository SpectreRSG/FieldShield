/**
 * Tutorial definitions. Each step targets a real element via its data-tour
 * attribute. `path` is relative to the current inspection (/i/:id/...).
 * `advanceOn: 'click'` waits for the user to use the control.
 */
import type { TutorialId } from '../domain/models';

export interface TourStep {
  target: string | string[];
  title: string;
  body: string;
  path?: string;
  advanceOn?: 'click';
}

export interface Tour {
  id: TutorialId;
  title: string;
  accent: string;
  steps: TourStep[];
}

const t = (name: string) => `[data-tour="${name}"]`;

export const TOURS: Tour[] = [
  {
    id: 'mission',
    title: 'Inspection Mission Control',
    accent: 'var(--blue)',
    steps: [
      { target: t('inspection-bar'), path: 'mission?tab=overview', title: 'Your current inspection', body: 'This bar always shows which inspection you are in, its status, how many documentation gaps remain, and checklist progress.' },
      { target: t('workflow'), path: 'mission?tab=overview', title: 'The 13-step workflow', body: 'Follow these steps from preparation to export. Completed steps get a green tick; tap any step to jump to it.' },
      { target: t('tab-checklist'), path: 'mission?tab=overview', title: 'Open the checklist', body: 'Tap “Checklist” to see the items suggested for this loss type.', advanceOn: 'click' },
      { target: t('phase-pre_inspection'), path: 'mission?tab=checklist', title: 'Track each item', body: 'Give every item a status — including “Not applicable”. Items are suggestions, not requirements. Mark the pre-inspection review complete when ready.' },
      { target: t('tab-areas'), path: 'mission?tab=checklist', title: 'Areas & observations', body: 'Tap “Areas & observations” to organise the inspection by location.', advanceOn: 'click' },
      { target: t('add-area'), path: 'mission?tab=areas', title: 'Add locations', body: 'Add elevations, roof planes, rooms or other locations. Each area has its own photo checklist and quick observation button.' },
      { target: t('tab-gaps'), path: 'mission?tab=areas', title: 'Check for gaps', body: 'Tap “Gaps & checks” to see what may be missing.', advanceOn: 'click' },
      { target: t('gaps-panel'), path: 'mission?tab=gaps', title: 'Documentation gaps', body: 'Missing photos, measurements, notes and reviews are listed here with a “Fix” button that takes you to the right module.' },
      { target: t('export-link'), path: 'mission?tab=gaps', title: 'Review & export', body: 'When you are finished, use “Review & export” for the final review and the combined review package.' }
    ]
  },
  {
    id: 'measure',
    title: 'Roof and Room Measurements',
    accent: 'var(--green)',
    steps: [
      { target: t('tab-roof'), path: 'measure?tab=roof', title: 'Roof measurements', body: 'The Roof tab holds roof planes, linear features (ridges, hips, valleys, eaves, rakes) and waste scenarios.' },
      { target: t('add-plane'), path: 'measure?tab=roof', title: 'Add a roof plane', body: 'Each plane can be a rectangle, triangle or trapezoid. Type dimensions like 12\'6" or 3.8m. Blank stays “not recorded”.' },
      { target: t('roof-summary'), path: 'measure?tab=roof', title: 'Measured vs estimated', body: 'Measured area is shown separately from waste-adjusted material quantities. Incomplete planes are excluded and listed.' },
      { target: t('tab-rooms'), path: 'measure?tab=roof', title: 'Rooms', body: 'Tap “Rooms” for interior measurements.', advanceOn: 'click' },
      { target: t('add-room'), path: 'measure?tab=rooms', title: 'Room calculator', body: 'Enter length, width and ceiling height. Add doors and windows to get adjusted wall area. Irregular rooms support extra segments.' },
      { target: t('tab-worksheet'), path: 'measure?tab=rooms', title: 'Worksheet', body: 'Export a measurement worksheet (PDF or CSV) to review before entering quantities manually.' }
    ]
  },
  {
    id: 'photos',
    title: 'Photo Evidence Organizer',
    accent: 'var(--orange)',
    steps: [
      { target: t('photo-capture'), path: 'photos?tab=library', title: 'Capture or import', body: 'Choose an area to file into, then take a photo (opens the camera on phones) or import existing photos. Originals are never changed.' },
      { target: [t('photo-grid'), t('photo-capture')], path: 'photos?tab=library', title: 'Classify and caption', body: 'Tap a photo to set its area, shot type, component and caption, accept or correct suggestions, link observations, or annotate a copy.' },
      { target: t('tab-coverage'), path: 'photos?tab=library', title: 'Coverage checklist', body: 'Tap “Coverage checklist”.', advanceOn: 'click' },
      { target: t('coverage'), path: 'photos?tab=coverage', title: 'Possibly missing photos', body: 'Each area lists overview, context and close-up coverage. Tap a chip to change what this area needs.' },
      { target: t('tab-index'), path: 'photos?tab=coverage', title: 'Photo index', body: 'The numbered photo index can be downloaded as PDF or CSV and is included in reports.' }
    ]
  },
  {
    id: 'notes',
    title: 'Field Notes and Report Assistant',
    accent: 'var(--purple)',
    steps: [
      { target: t('note-composer'), path: 'notes?tab=notes', title: 'Structured notes', body: 'Choose what kind of note it is — direct observation, reported statement, assumption, interpretation or question — so facts stay separate from opinions.' },
      { target: [t('dictate'), t('note-composer')], path: 'notes?tab=notes', title: 'Dictation', body: 'Where your browser supports it (and you allow it), dictate notes hands-free. Unsent text is kept if the app closes.' },
      { target: [t('link-photos'), t('note-composer')], path: 'notes?tab=notes', title: 'Link evidence', body: 'Link supporting photographs and measurements to each note.' },
      { target: t('consistency'), path: 'notes?tab=notes', title: 'Consistency flags', body: 'Contradictions, cause language in direct observations and unsupported interpretations are flagged here.' },
      { target: t('tab-report'), path: 'notes?tab=notes', title: 'Report', body: 'Tap “Report”.', advanceOn: 'click' },
      { target: [t('generate-report'), t('report-status')], path: 'notes?tab=report', title: 'Draft, edit, approve', body: 'The draft is built only from your records. Edit any section, approve each one, then mark the report final-reviewed and download the PDF.' }
    ]
  },
  {
    id: 'qc',
    title: 'Estimate Quality-Control Assistant',
    accent: 'var(--red)',
    steps: [
      { target: t('estimate-lines'), path: 'qc?tab=estimate', title: 'Estimate lines', body: 'Enter estimate lines manually: description, quantity, unit, price, total and the area they relate to.' },
      { target: t('tab-import'), path: 'qc?tab=estimate', title: 'Import', body: 'Tap “Import CSV”.', advanceOn: 'click' },
      { target: t('import-panel'), path: 'qc?tab=import', title: 'Import with mapping', body: 'Choose a CSV, match its columns to FieldShield fields, check the preview, then import. Nothing is saved until you confirm.' },
      { target: t('tab-findings'), path: 'qc?tab=import', title: 'Findings', body: 'Tap “QC findings”.', advanceOn: 'click' },
      { target: t('run-qc'), path: 'qc?tab=findings', title: 'Run the checks', body: 'Confirmed arithmetic errors are listed separately from potential concerns. Every finding explains why it was raised; set a disposition for each.' }
    ]
  }
];
