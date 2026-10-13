/**
 * Report and Export Generator.
 *
 * Produces PDF documents (report, measurement worksheet, photo index, QC summary),
 * CSV worksheets, a combined ZIP review package, and full JSON backups. All
 * generation happens on this device; nothing is uploaded anywhere.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import Papa from 'papaparse';
import {
  BackupFileSchema,
  FINDING_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  SHOT_TYPE_LABELS,
  VALUE_SOURCE_LABELS,
  LOSS_TYPE_LABELS,
  type BackupFile,
  type Inspection,
  type Report,
  type UnitSystem
} from '../domain/models';
import { areaLabel } from './inspectionRecord';
import { calcRoom, pitchAngleDegrees, roofPlaneArea, summarizeRoof } from './measurement';
import { fmtArea, fmtDim, fmtLengthFt, fmtNumber, toFeet } from './units';
import { lineLabel, RULE_LABELS, summarizeFindings } from './estimateQC';
import { blobToDataUrl, blobToJpegDataUrl } from './photos';
import { latestReport } from './validation';

export type BlobGetter = (key: string) => Promise<Blob | undefined>;

const NAVY: [number, number, number] = [18, 40, 74];
const MARGIN = 40;

/** Map characters the built-in PDF fonts cannot draw to safe equivalents. */
export function pdfText(s: string): string {
  return s
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≈/g, '~')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/›/g, '>')
    .replace(/–/g, '-')
    .replace(/—/g, ' - ')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '?');
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'inspection';
}

export function fileBase(insp: Inspection): string {
  return `FieldShield_${safeName(insp.claimNumber || insp.title)}`;
}

interface Doc {
  pdf: jsPDF;
  y: number;
  pageW: number;
  pageH: number;
}

function newDoc(title: string, insp: Inspection, subtitle: string, watermark?: string): Doc {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  pdf.setProperties({ title: pdfText(title), subject: 'FieldShield inspection document', creator: 'FieldShield' });
  const doc: Doc = { pdf, y: 0, pageW: pdf.internal.pageSize.getWidth(), pageH: pdf.internal.pageSize.getHeight() };
  (pdf as unknown as { __fs: { title: string; insp: Inspection; watermark?: string } }).__fs = { title, insp, watermark };
  drawHeader(doc, title, subtitle);
  return doc;
}

function drawShield(pdf: jsPDF, x: number, y: number, s: number) {
  pdf.setFillColor(255, 255, 255);
  pdf.lines(
    [
      [s / 2, -s * 0.12],
      [s / 2, s * 0.12],
      [0, s * 0.45],
      [-s / 2, s * 0.55],
      [-s / 2, -s * 0.55]
    ],
    x,
    y + s * 0.12,
    [1, 1],
    'F',
    true
  );
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(s * 0.1);
  pdf.line(x + s * 0.25, y + s * 0.52, x + s * 0.43, y + s * 0.7);
  pdf.line(x + s * 0.43, y + s * 0.7, x + s * 0.76, y + s * 0.34);
}

function drawHeader(doc: Doc, title: string, subtitle: string) {
  const { pdf, pageW } = doc;
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, pageW, 70, 'F');
  drawShield(pdf, MARGIN, 16, 34);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('FieldShield', MARGIN + 46, 38);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Inspect. Document. Verify.', MARGIN + 46, 52);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(pdfText(title), pageW - MARGIN, 36, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(pdfText(subtitle), pageW - MARGIN, 52, { align: 'right' });
  pdf.setTextColor(20, 20, 20);
  doc.y = 96;
}

function finalize(doc: Doc): Blob {
  const { pdf, pageW, pageH } = doc;
  const meta = (pdf as unknown as { __fs: { title: string; insp: Inspection; watermark?: string } }).__fs;
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    if (meta.watermark) {
      pdf.setTextColor(225, 228, 235);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(64);
      pdf.text(meta.watermark, pageW / 2, pageH / 2, { align: 'center', angle: 35 });
    }
    pdf.setTextColor(110, 110, 110);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const left = `${pdfText(meta.insp.claimNumber)}${meta.insp.isDemo ? ' - FICTIONAL DEMONSTRATION DATA' : ''}`;
    pdf.text(left, MARGIN, pageH - 20);
    pdf.text(`Generated ${new Date().toLocaleString()} - Page ${i} of ${n}`, pageW - MARGIN, pageH - 20, { align: 'right' });
  }
  return pdf.output('blob');
}

function ensure(doc: Doc, needed: number) {
  if (doc.y + needed > doc.pageH - 50) {
    doc.pdf.addPage();
    doc.y = 50;
  }
}

function heading(doc: Doc, text: string) {
  ensure(doc, 40);
  doc.pdf.setFont('helvetica', 'bold');
  doc.pdf.setFontSize(13);
  doc.pdf.setTextColor(...NAVY);
  doc.pdf.text(pdfText(text), MARGIN, doc.y);
  doc.pdf.setDrawColor(...NAVY);
  doc.pdf.setLineWidth(0.8);
  doc.pdf.line(MARGIN, doc.y + 4, doc.pageW - MARGIN, doc.y + 4);
  doc.pdf.setTextColor(20, 20, 20);
  doc.y += 20;
}

function paragraph(doc: Doc, text: string, size = 10) {
  doc.pdf.setFont('helvetica', 'normal');
  doc.pdf.setFontSize(size);
  const lines = doc.pdf.splitTextToSize(pdfText(text), doc.pageW - MARGIN * 2) as string[];
  for (const l of lines) {
    ensure(doc, size + 4);
    doc.pdf.text(l, MARGIN, doc.y);
    doc.y += size + 4;
  }
  doc.y += 6;
}

function table(doc: Doc, head: string[], body: (string | number)[][], opts: { fontSize?: number } = {}) {
  autoTable(doc.pdf, {
    startY: doc.y,
    head: [head.map(pdfText)],
    body: body.map((r) => r.map((c) => pdfText(String(c)))),
    margin: { left: MARGIN, right: MARGIN, top: 50, bottom: 50 },
    styles: { fontSize: opts.fontSize ?? 8.5, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: NAVY, textColor: 255 },
    alternateRowStyles: { fillColor: [244, 246, 250] }
  });
  doc.y = ((doc.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? doc.y) + 18;
}

// ---------------------------------------------------------------------------
// Inspection report
// ---------------------------------------------------------------------------

export async function buildReportPdf(insp: Inspection, report: Report, getBlob: BlobGetter, system: UnitSystem): Promise<Blob> {
  const watermark = report.status === 'final_reviewed' ? undefined : 'DRAFT';
  const doc = newDoc('Inspection Report', insp, `v${report.version} - ${REPORT_STATUS_LABELS[report.status]}`, watermark);
  paragraph(
    doc,
    `${report.title}. Generated ${new Date(report.generatedAt).toLocaleString()}.${report.approvedAt ? ` Final review completed ${new Date(report.approvedAt).toLocaleString()}${report.approvedBy ? ` by ${report.approvedBy}` : ''}.` : ' This report has not completed final user review.'}`,
    9
  );
  for (const s of report.sections) {
    heading(doc, s.title);
    paragraph(doc, s.body || '(No content)');
    if (s.key === 'observations' && report.damageTable.length) {
      heading(doc, 'Damage documentation table');
      table(
        doc,
        ['Location', 'Component', 'Observed condition', 'Dimensions', 'Photos', 'Notes'],
        report.damageTable.map((r) => [r.location, r.component, r.condition, r.dimensions, r.photos, r.notes]),
        { fontSize: 8 }
      );
    }
  }
  if (report.issues.length) {
    heading(doc, 'Documentation consistency issues at time of generation');
    table(doc, ['Type', 'Issue'], report.issues.map((i) => [i.severity, i.message]));
  }
  await appendPhotoPages(doc, insp, getBlob, report.sourceRecordIds.photos);
  void system;
  return finalize(doc);
}

async function appendPhotoPages(doc: Doc, insp: Inspection, getBlob: BlobGetter, onlyIds?: string[]) {
  const photos = insp.photos.filter((p) => !onlyIds || onlyIds.includes(p.id));
  if (!photos.length) return;
  doc.pdf.addPage();
  doc.y = 50;
  heading(doc, 'Photographs');
  const colW = (doc.pageW - MARGIN * 2 - 16) / 2;
  const imgH = colW * 0.75;
  const cellH = imgH + 64;
  let col = 0;
  for (const p of photos) {
    if (col === 0) ensure(doc, cellH);
    const x = MARGIN + col * (colW + 16);
    const y = doc.y;
    const blob = await getBlob(p.blobKey);
    if (blob) {
      try {
        const img = await blobToJpegDataUrl(blob, 900);
        const ratio = Math.min(colW / img.width, imgH / img.height);
        doc.pdf.addImage(img.dataUrl, 'JPEG', x, y, img.width * ratio, img.height * ratio);
      } catch {
        doc.pdf.text('[image could not be read]', x, y + 20);
      }
    } else {
      doc.pdf.setFontSize(9);
      doc.pdf.text('[image missing from device storage]', x, y + 20);
    }
    doc.pdf.setFont('helvetica', 'bold');
    doc.pdf.setFontSize(9);
    const n = insp.photos.indexOf(p) + 1;
    doc.pdf.text(pdfText(`Photo ${n}${p.isOriginal ? '' : ' (annotated copy)'} - ${areaLabel(insp, p.areaId)}`), x, y + imgH + 14, { maxWidth: colW });
    doc.pdf.setFont('helvetica', 'normal');
    doc.pdf.setFontSize(8);
    const cap = doc.pdf.splitTextToSize(pdfText(p.caption || '(no caption)'), colW) as string[];
    doc.pdf.text(cap.slice(0, 2), x, y + imgH + 26);
    doc.pdf.setTextColor(100, 100, 100);
    doc.pdf.text(
      pdfText(`${SHOT_TYPE_LABELS[p.shotType]}${p.component ? ` - ${p.component}` : ''} - ${new Date(p.capturedAt).toLocaleString()}`),
      x,
      y + imgH + 48,
      { maxWidth: colW }
    );
    doc.pdf.setTextColor(20, 20, 20);
    col = (col + 1) % 2;
    if (col === 0) doc.y += cellH;
  }
  if (col === 1) doc.y += cellH;
}

// ---------------------------------------------------------------------------
// Measurement worksheet
// ---------------------------------------------------------------------------

export function measurementRows(insp: Inspection, system: UnitSystem) {
  const roof = insp.roofPlanes.map((p) => {
    const r = roofPlaneArea(p);
    return {
      type: 'Roof plane',
      name: p.name,
      location: areaLabel(insp, p.areaId),
      dimensions: `${p.shape}: ${fmtDim(p.length)}${p.length2 ? ` / ${fmtDim(p.length2)}` : ''} x ${fmtDim(p.width)} (${p.dimensionBasis} dims)${p.pitchRise !== undefined ? `, pitch ${p.pitchRise}/12 (${fmtNumber(pitchAngleDegrees(p.pitchRise), 1)}°)` : ''}`,
      result: r.value === null ? `INCOMPLETE - missing ${r.missing.join(', ')}` : fmtArea(r.value, system),
      formula: r.formula,
      source: VALUE_SOURCE_LABELS[p.source],
      id: p.id
    };
  });
  const lines = insp.roofLines.map((l) => ({
    type: 'Roof line',
    name: l.kind,
    location: l.roofPlaneId ? insp.roofPlanes.find((p) => p.id === l.roofPlaneId)?.name ?? '' : '',
    dimensions: fmtDim(l.length),
    result: fmtLengthFt(toFeet(l.length), system),
    formula: 'entered length',
    source: VALUE_SOURCE_LABELS[l.source],
    id: l.id
  }));
  const rooms = insp.rooms.flatMap((r) => {
    const c = calcRoom(r);
    const base = {
      type: 'Room',
      name: r.name,
      location: `${areaLabel(insp, r.areaId)}${r.level ? ` - ${r.level}` : ''}`,
      source: VALUE_SOURCE_LABELS[r.source],
      id: r.id
    };
    const v = (n: number | null) => (n === null ? `INCOMPLETE${c.missing.length ? ` - missing ${c.missing.join(', ')}` : ''}` : fmtArea(n, system));
    return [
      { ...base, dimensions: `L ${fmtDim(r.length)} x W ${fmtDim(r.width)} x H ${fmtDim(r.height)}${r.segments.length ? ` + ${r.segments.length} segment(s)` : ''}`, result: `Floor ${v(c.floorSqft)}`, formula: `${c.formulas.floor}` },
      { ...base, dimensions: '', result: `Ceiling ${v(c.ceilingSqft)}`, formula: 'same as floor area' },
      { ...base, dimensions: '', result: `Gross wall ${v(c.grossWallSqft)}`, formula: `${c.formulas.perimeter}; ${c.formulas.grossWall}` },
      { ...base, dimensions: `${r.openings.length} opening(s)`, result: `Openings ${fmtArea(c.openingsSqft, system)}`, formula: c.formulas.openings },
      { ...base, dimensions: '', result: `Adjusted wall ${v(c.adjustedWallSqft)}`, formula: c.formulas.adjustedWall }
    ];
  });
  return [...roof, ...lines, ...rooms];
}

export function measurementCsv(insp: Inspection, system: UnitSystem): string {
  return Papa.unparse(
    measurementRows(insp, system).map((r) => ({
      Type: r.type,
      Name: r.name,
      Location: r.location,
      'Dimensions (as entered)': r.dimensions,
      Result: r.result,
      Formula: r.formula,
      'Value source': r.source,
      'Record ID': r.id
    }))
  );
}

export function buildMeasurementPdf(insp: Inspection, system: UnitSystem): Blob {
  const doc = newDoc('Measurement Worksheet', insp, `${insp.claimNumber} - for review before estimate entry`);
  paragraph(
    doc,
    'Dimensions are shown exactly as entered. Results are calculated from those dimensions. Value sources (measured, estimated, imported, calculated) are listed for every record. Incomplete items are excluded from totals and are never filled in automatically. FieldShield does not transfer data to Xactimate; quantities must be reviewed and entered manually.',
    9
  );
  const s = summarizeRoof(insp.roofPlanes, insp.roofLines, insp.wasteScenarios);
  heading(doc, 'Roof summary');
  table(doc, ['Item', 'Value'], [
    ['Planes complete', `${s.completePlanes} of ${s.planeCount}`],
    ['Measured roof surface area', `${fmtArea(s.totalAreaSqft, system)} (${s.totalSquares} squares)`],
    ...(['ridge', 'hip', 'valley', 'eave', 'rake'] as const).map((k) => [`${k[0].toUpperCase()}${k.slice(1)} total`, fmtLengthFt(s.linearTotalsFt[k], system)]),
    ...s.wasteScenarios.map((w) => [`Estimated material incl. ${w.percent}% waste (not measured)`, `${fmtArea(w.areaSqft, system)} (${w.squares} squares)`])
  ]);
  heading(doc, 'Measurement detail');
  table(
    doc,
    ['Type', 'Name', 'Location', 'Dimensions (as entered)', 'Result', 'Formula', 'Source'],
    measurementRows(insp, system).map((r) => [r.type, r.name, r.location, r.dimensions, r.result, r.formula, r.source]),
    { fontSize: 7.5 }
  );
  return finalize(doc);
}

// ---------------------------------------------------------------------------
// Photo index
// ---------------------------------------------------------------------------

export function photoIndexRows(insp: Inspection) {
  return insp.photos.map((p, i) => ({
    number: i + 1,
    fileName: p.fileName,
    area: areaLabel(insp, p.areaId),
    shot: SHOT_TYPE_LABELS[p.shotType],
    component: p.component,
    damageCategory: p.damageCategory ? LOSS_TYPE_LABELS[p.damageCategory] : '',
    caption: p.caption,
    captured: p.capturedAt,
    version: p.isOriginal ? 'Original' : `Annotated copy of Photo ${insp.photos.findIndex((x) => x.id === p.derivedFromId) + 1}`,
    observations: insp.observations.filter((o) => o.photoIds.includes(p.id)).length,
    id: p.id
  }));
}

export function photoIndexCsv(insp: Inspection): string {
  return Papa.unparse(
    photoIndexRows(insp).map((r) => ({
      'Photo #': r.number,
      'File name': r.fileName,
      Area: r.area,
      'Shot type': r.shot,
      Component: r.component,
      'Damage category': r.damageCategory,
      Caption: r.caption,
      'Captured / imported': r.captured,
      Version: r.version,
      'Linked observations': r.observations,
      'Record ID': r.id
    }))
  );
}

export async function buildPhotoIndexPdf(insp: Inspection, getBlob: BlobGetter): Promise<Blob> {
  const doc = newDoc('Photo Index', insp, `${insp.photos.length} photograph(s)`);
  paragraph(
    doc,
    'Numbered index of photographs recorded for this inspection. Photographs document conditions at the time they were taken; they do not by themselves establish cause, coverage, or repair necessity. Originals are preserved unchanged; annotated copies are identified.',
    9
  );
  table(
    doc,
    ['#', 'Area', 'Shot', 'Component', 'Caption', 'Version', 'Captured'],
    photoIndexRows(insp).map((r) => [r.number, r.area, r.shot, r.component, r.caption || '(no caption)', r.version, new Date(r.captured).toLocaleString()]),
    { fontSize: 7.5 }
  );
  await appendPhotoPages(doc, insp, getBlob);
  return finalize(doc);
}

// ---------------------------------------------------------------------------
// QC summary
// ---------------------------------------------------------------------------

export function qcCsv(insp: Inspection): string {
  return Papa.unparse(
    insp.findings.map((f) => ({
      Classification: f.classification === 'confirmed_arithmetic' ? 'Confirmed arithmetic error' : 'Potential concern',
      Rule: RULE_LABELS[f.rule],
      Finding: f.title,
      Explanation: f.explanation,
      Status: FINDING_STATUS_LABELS[f.status],
      'Still reproduced': f.stale ? 'No (data changed since)' : 'Yes',
      'Reviewer note': f.userNote,
      'Finding ID': f.id
    }))
  );
}

export function buildQcPdf(insp: Inspection): Blob {
  const doc = newDoc('Estimate QC Summary', insp, insp.estimate?.name ?? 'No estimate entered');
  paragraph(
    doc,
    'Preliminary quality-control review comparing estimate entries with recorded inspection evidence. Confirmed arithmetic errors are listed separately from potential concerns. Potential concerns are prompts for review only - FieldShield does not make coverage decisions, approve or deny claims, determine settlement amounts, or prescribe repairs.',
    9
  );
  if (!insp.estimate) {
    paragraph(doc, 'No estimate data has been entered or imported for this inspection.');
    return finalize(doc);
  }
  const s = summarizeFindings(insp.findings);
  heading(doc, 'Summary');
  table(doc, ['Measure', 'Count'], [
    ['Estimate lines', insp.estimate.lines.length],
    ['Active findings', s.total],
    ['Confirmed arithmetic errors', s.confirmedArithmetic],
    ['Potential concerns', s.potentialConcerns],
    ...(Object.keys(s.byStatus) as (keyof typeof s.byStatus)[]).map((k) => [`Status: ${FINDING_STATUS_LABELS[k]}`, s.byStatus[k]]),
    ['Findings no longer reproduced (kept for record)', s.stale],
    ['Last QC run', insp.qcLastRunAt ? new Date(insp.qcLastRunAt).toLocaleString() : 'Not run']
  ]);
  const active = insp.findings.filter((f) => !f.stale);
  const confirmed = active.filter((f) => f.classification === 'confirmed_arithmetic');
  const potential = active.filter((f) => f.classification === 'potential_concern');
  heading(doc, 'Confirmed arithmetic errors');
  if (confirmed.length) table(doc, ['Finding', 'Why it was generated', 'Status', 'Note'], confirmed.map((f) => [f.title, f.explanation, FINDING_STATUS_LABELS[f.status], f.userNote]));
  else paragraph(doc, 'None found.');
  heading(doc, 'Potential concerns requiring review');
  if (potential.length)
    table(doc, ['Rule', 'Finding', 'Why it was generated', 'Status', 'Note'], potential.map((f) => [RULE_LABELS[f.rule], f.title, f.explanation, FINDING_STATUS_LABELS[f.status], f.userNote]), { fontSize: 7.5 });
  else paragraph(doc, 'None found.');
  heading(doc, 'Estimate lines reviewed');
  table(
    doc,
    ['Line', 'Description', 'Qty', 'Unit', 'Unit price', 'Total', 'Area'],
    insp.estimate.lines.map((l) => [l.lineNo, l.description, l.quantity ?? '', l.unit, l.unitPrice ?? '', l.total ?? '', areaLabel(insp, l.areaId)]),
    { fontSize: 7.5 }
  );
  void lineLabel;
  return finalize(doc);
}

// ---------------------------------------------------------------------------
// Combined package, backups, downloads
// ---------------------------------------------------------------------------

export const PACKAGE_README = (insp: Inspection) => `FieldShield inspection review package
=====================================
Inspection: ${insp.claimNumber} - ${insp.title}
Exported: ${new Date().toISOString()}
${insp.isDemo ? 'NOTE: This package contains FICTIONAL demonstration data only.\n' : ''}
Contents
--------
report.pdf                 Latest inspection report (watermarked DRAFT unless final review is complete)
measurement-worksheet.pdf  Measurement worksheet with dimensions as entered, formulas and value sources
measurement-worksheet.csv  Same data as CSV for review
photo-index.pdf            Numbered photo index with images and captions
photo-index.csv            Photo index as CSV
qc-summary.pdf             Estimate quality-control summary (if estimate data was entered)
qc-findings.csv            QC findings with dispositions
photos/originals/          Original photographs exactly as captured/imported
photos/annotated/          Annotated copies (originals are never modified)
inspection-data.json       Complete structured inspection record (FieldShield backup format)

Important
---------
- This package was generated on the user's device. FieldShield did not upload it anywhere.
- Store and share it only in systems approved by your employer.
- FieldShield does not make coverage decisions and has no Xactimate integration.
`;

export async function buildReviewPackage(
  insp: Inspection,
  getBlob: BlobGetter,
  system: UnitSystem,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('README.txt', PACKAGE_README(insp));
  const report = latestReport(insp);
  if (report) {
    onProgress?.('Building report PDF…');
    zip.file('report.pdf', await buildReportPdf(insp, report, getBlob, system));
  }
  onProgress?.('Building measurement worksheet…');
  zip.file('measurement-worksheet.pdf', buildMeasurementPdf(insp, system));
  zip.file('measurement-worksheet.csv', measurementCsv(insp, system));
  onProgress?.('Building photo index…');
  zip.file('photo-index.pdf', await buildPhotoIndexPdf(insp, getBlob));
  zip.file('photo-index.csv', photoIndexCsv(insp));
  zip.file('qc-summary.pdf', buildQcPdf(insp));
  zip.file('qc-findings.csv', qcCsv(insp));
  onProgress?.('Adding photographs…');
  for (const [i, p] of insp.photos.entries()) {
    const b = await getBlob(p.blobKey);
    if (!b) continue;
    const ext = (p.mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const folder = p.isOriginal ? 'originals' : 'annotated';
    zip.file(`photos/${folder}/${String(i + 1).padStart(3, '0')}_${safeName(p.fileName.replace(/\.[^.]+$/, ''))}.${ext}`, b);
  }
  onProgress?.('Adding structured data…');
  zip.file('inspection-data.json', JSON.stringify(await buildBackup([insp], getBlob, false), null, 2));
  onProgress?.('Compressing…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function buildBackup(inspections: Inspection[], getBlob: BlobGetter, includeBlobs = true): Promise<BackupFile> {
  const blobs: Record<string, string> = {};
  if (includeBlobs) {
    for (const insp of inspections) {
      for (const p of insp.photos) {
        for (const key of [p.blobKey, p.thumbKey]) {
          const b = await getBlob(key);
          if (b) blobs[key] = await blobToDataUrl(b);
        }
      }
    }
  }
  return { format: 'fieldshield-backup', formatVersion: 1, exportedAt: new Date().toISOString(), inspections, blobs };
}

export type BackupParse = { ok: true; backup: BackupFile } | { ok: false; error: string };

/** Validate a backup completely before anything is written. */
export function parseBackup(text: string): BackupParse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON (it may be incomplete or damaged).' };
  }
  const r = BackupFileSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `Not a valid FieldShield backup: ${first?.path.join('.') || 'file'} — ${first?.message}` };
  }
  return { ok: true, backup: r.data };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadText(text: string, fileName: string, type = 'text/csv'): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName);
}
