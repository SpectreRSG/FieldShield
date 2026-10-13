/** Final user review and export of the combined inspection review package. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { REPORT_STATUS_LABELS } from '../domain/models';
import { nowIso } from '../domain/ids';
import { useStore } from '../state/store';
import { InspectionWorkspace, useInsp } from '../components/Workspace';
import { fmtDate, Notice, Pill, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { findConsistencyIssues, findGaps, latestReport } from '../services/validation';
import { summarizeFindings } from '../services/estimateQC';
import { workflowSteps } from '../services/workflow';
import {
  buildBackup,
  buildMeasurementPdf,
  buildPhotoIndexPdf,
  buildQcPdf,
  buildReportPdf,
  buildReviewPackage,
  downloadBlob,
  downloadText,
  fileBase
} from '../services/exports';

export function ExportReview() {
  return (
    <InspectionWorkspace module="export" description="Complete your final review, then export the combined review package or individual documents.">
      <ExportBody />
    </InspectionWorkspace>
  );
}

function ExportBody() {
  const { insp, update } = useInsp();
  const store = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState(insp.reviews.finalReviewNote);
  const gaps = useMemo(() => findGaps(insp).filter((g) => g.key !== 'rev-report-draft' && g.key !== 'rev-report-none'), [insp]);
  const issues = useMemo(() => findConsistencyIssues(insp), [insp]);
  const report = latestReport(insp);
  const qc = summarizeFindings(insp.findings);
  const steps = workflowSteps(insp);
  const sys = store.settings.unitSystem;

  const checks = [
    { ok: !!report && report.status === 'final_reviewed', label: report ? `Report v${report.version}: ${REPORT_STATUS_LABELS[report.status]}` : 'No report generated', link: `/i/${insp.id}/notes?tab=report` },
    { ok: gaps.filter((g) => g.severity === 'gap').length === 0, label: `${gaps.filter((g) => g.severity === 'gap').length} documentation gap(s)`, link: `/i/${insp.id}/mission?tab=gaps` },
    { ok: issues.filter((i) => i.severity === 'contradiction').length === 0, label: `${issues.filter((i) => i.severity === 'contradiction').length} contradiction(s), ${issues.filter((i) => i.severity !== 'contradiction').length} other flag(s)`, link: `/i/${insp.id}/notes` },
    { ok: !insp.estimate || (!!insp.qcLastRunAt && qc.byStatus.open === 0), label: insp.estimate ? (insp.qcLastRunAt ? `${qc.byStatus.open} QC finding(s) not dispositioned` : 'QC not run on estimate') : 'No estimate entered (optional)', link: `/i/${insp.id}/qc?tab=findings` },
    { ok: insp.followUps.every((f) => f.status === 'done'), label: `${insp.followUps.filter((f) => f.status === 'open').length} open follow-up task(s)`, link: `/i/${insp.id}/mission?tab=followups` },
    { ok: !!insp.reviews.departureReviewCompletedAt, label: insp.reviews.departureReviewCompletedAt ? 'Departure review complete' : 'Departure review not completed', link: `/i/${insp.id}/mission?tab=checklist` }
  ];

  const completeReview = async () => {
    const failing = checks.filter((c) => !c.ok);
    if (failing.length) {
      const ok = await confirm({
        title: 'Complete final review with open items?',
        message: (
          <>
            <p>These items are still open:</p>
            <ul>
              {failing.map((c) => (
                <li key={c.label}>{c.label}</li>
              ))}
            </ul>
            <p>They will be recorded as open at the time of your review.</p>
          </>
        ),
        confirmLabel: 'Complete review'
      });
      if (!ok) return;
    }
    await update((d) => {
      d.reviews.finalReviewCompletedAt = nowIso();
      d.reviews.finalReviewNote = note;
      if (d.status !== 'completed') d.status = 'in_review';
    }, `Final user review completed${failing.length ? ` with ${failing.length} open item(s)` : ''}`);
    toast('Final review recorded', 'ok');
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await update((d) => void (d.reviews.lastExportedAt = nowIso()), `Exported: ${label}`);
      toast(`${label} downloaded`, 'ok');
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div>
        <section className="panel" data-tour="final-review">
          <div className="panel-head">
            <h2>Final user review</h2>
            {insp.reviews.finalReviewCompletedAt && <Pill color="green">Completed {fmtDate(insp.reviews.finalReviewCompletedAt)}</Pill>}
          </div>
          <ul className="list">
            {checks.map((c) => (
              <li key={c.label} className="row between" style={{ flexWrap: 'nowrap' }}>
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  <Pill color={c.ok ? 'green' : 'amber'}>{c.ok ? <Icon name="check" size={13} /> : '!'}</Pill>
                  {c.label}
                </span>
                {!c.ok && (
                  <Link to={c.link} className="btn small">
                    Review
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Final review note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything a reviewer should know about open items or limitations" />
          </label>
          <div className="row end" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={completeReview} data-testid="complete-final-review">
              <Icon name="check" /> Record final review
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Workflow progress</h2>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {steps.map((s) => (
              <li key={s.n} style={{ color: s.done ? 'var(--green)' : undefined }}>
                {s.label} {s.done ? '✓' : ''}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div>
        <section className="panel" data-tour="export-package">
          <h2>Export</h2>
          {insp.reviews.lastExportedAt && <small>Last export: {fmtDate(insp.reviews.lastExportedAt)}</small>}
          <Notice kind="warn">Exports are files on this device. Store and share them only in systems approved by your employer.</Notice>
          <button
            className="btn primary block"
            disabled={!!busy}
            data-testid="export-package"
            onClick={() =>
              run('Review package', async () => {
                const zip = await buildReviewPackage(insp, store.getBlob, sys, (m) => setBusy(m));
                downloadBlob(zip, `${fileBase(insp)}_review-package.zip`);
              })
            }
          >
            <Icon name="pkg" /> {busy ?? 'Download combined review package (.zip)'}
          </button>
          <small>Contains the report, measurement worksheet, photo index, QC summary, CSVs, original and annotated photos, and the structured data.</small>
          <div className="stack" style={{ marginTop: 12 }}>
            <button className="btn" disabled={!!busy || !report} onClick={() => run('Report PDF', async () => downloadBlob(await buildReportPdf(insp, report!, store.getBlob, sys), `${fileBase(insp)}_report_v${report!.version}.pdf`))} data-testid="export-report">
              <Icon name="file" /> Inspection report (PDF){!report && ' — generate one first'}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run('Measurement worksheet', async () => downloadBlob(buildMeasurementPdf(insp, sys), `${fileBase(insp)}_measurement-worksheet.pdf`))}>
              <Icon name="measure" /> Measurement worksheet (PDF)
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run('Photo index', async () => downloadBlob(await buildPhotoIndexPdf(insp, store.getBlob), `${fileBase(insp)}_photo-index.pdf`))}>
              <Icon name="photos" /> Photo index (PDF)
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run('QC summary', async () => downloadBlob(buildQcPdf(insp), `${fileBase(insp)}_qc-summary.pdf`))}>
              <Icon name="qc" /> Estimate QC summary (PDF)
            </button>
            <button
              className="btn"
              disabled={!!busy}
              data-testid="export-backup-one"
              onClick={() => run('Inspection backup', async () => downloadText(JSON.stringify(await buildBackup([insp], store.getBlob)), `${fileBase(insp)}_backup.json`, 'application/json'))}
            >
              <Icon name="download" /> Backup of this inspection (JSON, restorable)
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Inspection status</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Set the status to Completed when your employer’s process allows. FieldShield never submits anything.
          </p>
          <button
            className="btn"
            disabled={insp.status === 'completed'}
            onClick={() => update((d) => void (d.status = 'completed'), 'Status set to Completed')}
            data-testid="mark-completed"
          >
            <Icon name="check" /> Mark inspection completed
          </button>
        </section>
      </div>
    </div>
  );
}
