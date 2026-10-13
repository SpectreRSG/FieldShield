/**
 * Module 4 — Field Notes and Report Assistant.
 * Structured notes (with dictation), consistency flags, and an editable report
 * generated only from recorded data. Every generated section must be approved
 * by the user before the report can be marked final.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CONDITION_LABELS,
  OBSERVATION_KIND_LABELS,
  REPORT_STATUS_LABELS,
  type Observation,
  type ObservationKind,
  type Report
} from '../domain/models';
import { nowIso } from '../domain/ids';
import { useStore } from '../state/store';
import { InspectionWorkspace, useInsp } from '../components/Workspace';
import { Empty, fmtDate, Modal, Notice, Pill, Tabs, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { ObservationForm } from '../components/ObservationForm';
import { areaLabel } from '../services/inspectionRecord';
import { describeMeasurement, generateReport, reportIsOutdated } from '../services/reportGenerator';
import { findConsistencyIssues, latestReport } from '../services/validation';
import { buildReportPdf, downloadBlob, fileBase } from '../services/exports';

type Tab = 'notes' | 'report' | 'versions';
const KIND_COLOR: Record<ObservationKind, string> = {
  direct_observation: 'green',
  reported_statement: 'blue',
  calculation: 'gray',
  assumption: 'amber',
  preliminary_interpretation: 'purple',
  unresolved_question: 'red'
};

export function NotesReport() {
  return (
    <InspectionWorkspace module="notes" description="Record structured notes, check them for contradictions, and turn them into an editable report you approve section by section.">
      <NotesBody />
    </InspectionWorkspace>
  );
}

function NotesBody() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'notes';
  return (
    <>
      <Tabs<Tab>
        label="Notes and report sections"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'notes', label: 'Field notes', tour: 'tab-notes' },
          { id: 'report', label: 'Report', tour: 'tab-report' },
          { id: 'versions', label: 'Versions' }
        ]}
      />
      {tab === 'notes' && <Notes />}
      {tab === 'report' && <ReportEditor />}
      {tab === 'versions' && <Versions />}
    </>
  );
}

function Notes() {
  const { insp, update } = useInsp();
  const { settings } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [areaFilter, setAreaFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<ObservationKind | ''>('');
  const [editing, setEditing] = useState<Observation | null>(null);
  const issues = useMemo(() => findConsistencyIssues(insp), [insp]);
  const issueIds = new Set(issues.flatMap((i) => i.relatedIds));
  const list = insp.observations
    .filter((o) => !areaFilter || (areaFilter === '_none' ? !o.areaId : o.areaId === areaFilter))
    .filter((o) => !kindFilter || o.kind === kindFilter);
  const groups = new Map<string, Observation[]>();
  for (const o of list) groups.set(o.areaId ?? '_none', [...(groups.get(o.areaId ?? '_none') ?? []), o]);
  void settings;

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div>
        <section className="panel" data-tour="note-composer">
          <h2>Add a note</h2>
          <ObservationForm
            insp={insp}
            defaultAreaId={areaFilter && areaFilter !== '_none' ? areaFilter : undefined}
            draftKey={`${insp.id}-notes`}
            onSave={(o) => {
              update((d) => void d.observations.push(o), `Added ${OBSERVATION_KIND_LABELS[o.kind].toLowerCase()} at ${areaLabel(insp, o.areaId)}`);
              toast('Note saved', 'ok');
            }}
          />
        </section>
      </div>
      <div>
        <section className="panel" data-tour="consistency">
          <div className="panel-head">
            <h2>Consistency flags</h2>
            <Pill color={issues.length ? 'red' : 'green'}>{issues.length}</Pill>
          </div>
          {issues.length === 0 ? (
            <small>No contradictions, unsupported conclusions or missing links detected.</small>
          ) : (
            issues.map((i) => (
              <div className="gap-item" key={i.id}>
                <Icon name="warn" />
                <div>
                  <Pill color={i.severity === 'contradiction' ? 'red' : i.severity === 'warning' ? 'amber' : 'gray'}>{i.severity}</Pill> {i.message}
                </div>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Notes ({insp.observations.length})</h2>
          </div>
          <div className="grid-2" style={{ marginBottom: 10 }}>
            <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filter by area">
              <option value="">All areas</option>
              <option value="_none">Unassigned</option>
              {insp.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {areaLabel(insp, a.id)}
                </option>
              ))}
            </select>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as ObservationKind | '')} aria-label="Filter by kind">
              <option value="">All kinds</option>
              {Object.entries(OBSERVATION_KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {list.length === 0 && <Empty icon="notes">No notes match.</Empty>}
          {[...groups.entries()].map(([areaId, obs]) => (
            <div key={areaId} style={{ marginBottom: 10 }}>
              <h3>{areaId === '_none' ? 'Unassigned' : areaLabel(insp, areaId)}</h3>
              <ul className="list">
                {obs.map((o) => (
                  <li key={o.id} data-testid="note-item">
                    <div className="row" style={{ gap: 5, marginBottom: 4 }}>
                      <Pill color={KIND_COLOR[o.kind]}>{OBSERVATION_KIND_LABELS[o.kind]}</Pill>
                      {o.condition !== 'not_assessed' && <Pill color={o.condition === 'damage_observed' ? 'red' : 'green'}>{CONDITION_LABELS[o.condition]}</Pill>}
                      {o.component && <Pill>{o.component}</Pill>}
                      {o.inputMethod === 'speech' && <Pill color="blue">Dictated</Pill>}
                      {issueIds.has(o.id) && <Pill color="red">Flagged</Pill>}
                    </div>
                    <div>
                      {o.text}
                      {o.reportedBy && <small> — reported by {o.reportedBy}</small>}
                    </div>
                    <small>
                      {o.photoIds.length} photo(s) · {o.measurementIds.length} measurement(s)
                      {o.measurementIds.length > 0 && `: ${o.measurementIds.map((m) => describeMeasurement(insp, m, settings.unitSystem)).filter(Boolean).join('; ')}`}
                    </small>
                    <div className="row" style={{ marginTop: 6 }}>
                      <button className="btn small" onClick={() => setEditing(o)}>
                        <Icon name="edit" /> Edit / link evidence
                      </button>
                      <button
                        className="btn small ghost danger"
                        aria-label="Delete note"
                        onClick={async () => {
                          if (await confirm({ title: 'Delete this note?', message: o.text, danger: true, confirmLabel: 'Delete' }))
                            update((d) => void (d.observations = d.observations.filter((x) => x.id !== o.id)), 'Deleted note');
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
      {editing && (
        <Modal title="Edit note" onClose={() => setEditing(null)} wide>
          <ObservationForm
            insp={insp}
            initial={editing}
            draftKey={`${insp.id}-edit`}
            onCancel={() => setEditing(null)}
            onSave={(o) => {
              update((d) => {
                const i = d.observations.findIndex((x) => x.id === o.id);
                d.observations[i] = o;
              }, 'Edited note');
              setEditing(null);
              toast('Note updated', 'ok');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ReportEditor() {
  const { insp, update } = useInsp();
  const store = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const report = latestReport(insp);
  const [busy, setBusy] = useState(false);
  const outdated = report ? reportIsOutdated(insp, report) : false;
  const issues = useMemo(() => findConsistencyIssues(insp), [insp]);

  const generate = async () => {
    if (report && report.status === 'final_reviewed') {
      const ok = await confirm({
        title: 'Create a new report version?',
        message: `Version ${report.version} is final. A new draft version will be created; version ${report.version} stays unchanged in the version history.`,
        confirmLabel: 'Create new draft'
      });
      if (!ok) return;
    }
    const r = generateReport(insp, { inspectorName: store.settings.inspectorName, unitSystem: store.settings.unitSystem });
    await update((d) => void d.reports.push(r), `Generated report v${r.version}`);
    toast(`Draft report v${r.version} generated from current records`, 'ok');
  };

  const setSection = (sectionId: string, mut: (s: Report['sections'][number]) => void, action?: string) =>
    update((d) => {
      const r = d.reports.find((x) => x.id === report!.id)!;
      const s = r.sections.find((x) => x.id === sectionId)!;
      if (r.status === 'final_reviewed') return; // final versions are locked
      mut(s);
      r.updatedAt = nowIso();
    }, action);

  const setStatus = async (status: Report['status']) => {
    if (!report) return;
    if (status === 'final_reviewed') {
      const unapproved = report.sections.filter((s) => !s.approved);
      if (unapproved.length) {
        toast(`Approve all sections first (${unapproved.length} remaining)`, 'error');
        return;
      }
      const ok = await confirm({
        title: 'Mark report as final-reviewed?',
        message: (
          <>
            <p>You confirm you have reviewed every section and that it reflects your own observations.</p>
            {outdated && <Notice kind="warn">Records have changed since this version was generated. Consider regenerating first.</Notice>}
            {issues.length > 0 && <Notice kind="warn">{issues.length} consistency flag(s) are still open.</Notice>}
          </>
        ),
        confirmLabel: 'Mark final'
      });
      if (!ok) return;
    }
    await update((d) => {
      const r = d.reports.find((x) => x.id === report.id)!;
      r.status = status;
      r.updatedAt = nowIso();
      if (status === 'final_reviewed') {
        r.approvedAt = nowIso();
        r.approvedBy = store.settings.inspectorName || 'Inspector';
      } else {
        r.approvedAt = undefined;
      }
    }, `Report v${report.version} status: ${REPORT_STATUS_LABELS[status]}`);
  };

  const pdf = async () => {
    if (!report) return;
    setBusy(true);
    try {
      downloadBlob(await buildReportPdf(insp, report, store.getBlob, store.settings.unitSystem), `${fileBase(insp)}_report_v${report.version}.pdf`);
      toast('Report PDF downloaded', 'ok');
    } catch (e) {
      toast(`PDF failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!report) {
    return (
      <section className="panel">
        <Empty icon="notes">
          <p>No report yet. The draft is assembled only from your recorded notes, measurements and photos — nothing is invented.</p>
          <button className="btn accent" onClick={generate} data-testid="generate-report" data-tour="generate-report">
            <Icon name="notes" /> Generate draft report
          </button>
        </Empty>
      </section>
    );
  }

  const approved = report.sections.filter((s) => s.approved).length;
  return (
    <>
      <section className="panel" data-tour="report-status">
        <div className="panel-head">
          <div>
            <h2>
              Report v{report.version} <Pill color={report.status === 'final_reviewed' ? 'green' : report.status === 'in_review' ? 'purple' : 'gray'}>{REPORT_STATUS_LABELS[report.status]}</Pill>
            </h2>
            <small>
              Generated {fmtDate(report.generatedAt)} · {approved}/{report.sections.length} sections approved
              {report.approvedAt && ` · final review ${fmtDate(report.approvedAt)} by ${report.approvedBy}`}
            </small>
          </div>
          <div className="row">
            <button className="btn" onClick={generate} data-testid="regenerate-report">
              <Icon name="refresh" /> {outdated ? 'Regenerate (records changed)' : 'Regenerate'}
            </button>
            <button className="btn accent" onClick={pdf} disabled={busy} data-testid="report-pdf">
              <Icon name="download" /> {busy ? 'Building PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
        {report.status === 'final_reviewed' && (
          <Notice kind="ok">This version is final and locked. Set it back to “In review” to edit, or regenerate to create a new version.</Notice>
        )}
        {outdated && (
          <Notice kind="warn">
            Notes, measurements or photos have changed since this version was generated. Regenerate to include them — your edited sections are kept.
          </Notice>
        )}
        <div className="row">
          <span className="field-label">Status:</span>
          <button className="btn small" aria-pressed={report.status === 'draft'} onClick={() => setStatus('draft')}>
            Draft
          </button>
          <button className="btn small" aria-pressed={report.status === 'in_review'} onClick={() => setStatus('in_review')}>
            In review
          </button>
          <button className="btn small primary" onClick={() => setStatus('final_reviewed')} disabled={report.status === 'final_reviewed'} data-testid="mark-final">
            <Icon name="check" /> Mark final-reviewed
          </button>
          <button
            className="btn small"
            disabled={report.status === 'final_reviewed'}
            onClick={() =>
              update((d) => {
                const r = d.reports.find((x) => x.id === report.id)!;
                r.sections.forEach((s) => (s.approved = true));
              }, `Approved all sections of report v${report.version}`)
            }
            data-testid="approve-all"
          >
            Approve all sections
          </button>
        </div>
      </section>

      {report.issues.length > 0 && (
        <section className="panel">
          <h3>Flags found when this version was generated</h3>
          {report.issues.map((i) => (
            <div key={i.id} className="gap-item">
              <Icon name="warn" />
              <div>
                <Pill color={i.severity === 'contradiction' ? 'red' : 'amber'}>{i.severity}</Pill> {i.message}
              </div>
            </div>
          ))}
          <small>
            Fix these in <Link to={`/i/${insp.id}/notes?tab=notes`}>Field notes</Link>, then regenerate.
          </small>
        </section>
      )}

      {report.sections.map((s) => (
        <SectionEditor
          key={s.id}
          section={s}
          onSave={(body) =>
            setSection(
              s.id,
              (t) => {
                t.body = body;
                t.edited = body !== t.generatedBody;
                t.approved = false;
                if (!t.edited) t.sourceChanged = false;
              },
              `Edited report section "${s.title}"`
            )
          }
          onApprove={(v) => setSection(s.id, (t) => void (t.approved = v), `${v ? 'Approved' : 'Unapproved'} section "${s.title}"`)}
          onRevert={() =>
            setSection(
              s.id,
              (t) => {
                t.body = t.generatedBody;
                t.edited = false;
                t.sourceChanged = false;
                t.approved = false;
              },
              `Reverted section "${s.title}" to generated text`
            )
          }
          damageTable={s.key === 'observations' ? report.damageTable : undefined}
          locked={report.status === 'final_reviewed'}
        />
      ))}
    </>
  );
}

function SectionEditor({
  section: s,
  onSave,
  onApprove,
  onRevert,
  damageTable,
  locked
}: {
  section: Report['sections'][number];
  onSave: (body: string) => void;
  onApprove: (v: boolean) => void;
  onRevert: () => void;
  damageTable?: Report['damageTable'];
  locked: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(s.body);
  return (
    <section className={`panel report-section ${s.approved ? 'approved' : ''}`} data-testid="report-section">
      <div className="panel-head">
        <h3>
          {s.title} {s.edited && <Pill color="blue">Edited by you</Pill>} {s.approved && <Pill color="green">Approved</Pill>}
        </h3>
        <div className="row">
          {!edit && !locked && (
            <button
              className="btn small"
              onClick={() => {
                setText(s.body);
                setEdit(true);
              }}
            >
              <Icon name="edit" /> Edit
            </button>
          )}
          <label className="checkline">
            <input type="checkbox" checked={s.approved} disabled={locked} onChange={(e) => onApprove(e.target.checked)} /> Approved
          </label>
        </div>
      </div>
      {s.sourceChanged && (
        <Notice kind="warn">
          The records behind this section changed after you edited it. Compare with the latest generated text below.
          <details>
            <summary>Show latest generated text</summary>
            <div className="pre">{s.generatedBody}</div>
          </details>
        </Notice>
      )}
      {edit ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label={`Edit ${s.title}`} />
          <div className="row end" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => setEdit(false)}>
              Cancel
            </button>
            {s.edited && (
              <button
                className="btn small"
                onClick={() => {
                  onRevert();
                  setEdit(false);
                }}
              >
                Revert to generated
              </button>
            )}
            <button
              className="btn small primary"
              onClick={() => {
                onSave(text);
                setEdit(false);
              }}
            >
              Save section
            </button>
          </div>
        </>
      ) : (
        <div className="pre">{s.body}</div>
      )}
      {damageTable && damageTable.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Damage documentation table</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Component</th>
                  <th>Observed condition</th>
                  <th>Dimensions</th>
                  <th>Photos</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {damageTable.map((r) => (
                  <tr key={r.observationId}>
                    <td>{r.location}</td>
                    <td>{r.component}</td>
                    <td>{r.condition}</td>
                    <td>{r.dimensions}</td>
                    <td>{r.photos}</td>
                    <td>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Versions() {
  const { insp } = useInsp();
  const store = useStore();
  const versions = [...insp.reports].sort((a, b) => b.version - a.version);
  return (
    <section className="panel">
      <h2>Report versions</h2>
      {versions.length === 0 && <Empty>No reports yet.</Empty>}
      <ul className="list">
        {versions.map((r) => (
          <li key={r.id} className="row between">
            <div>
              <strong>v{r.version}</strong> <Pill color={r.status === 'final_reviewed' ? 'green' : 'gray'}>{REPORT_STATUS_LABELS[r.status]}</Pill>
              <br />
              <small>
                Generated {fmtDate(r.generatedAt)} · {r.sourceRecordIds.observations.length} notes, {r.sourceRecordIds.photos.length} photos,{' '}
                {r.sourceRecordIds.measurements.length} measurements
              </small>
            </div>
            <button className="btn small" onClick={async () => downloadBlob(await buildReportPdf(insp, r, store.getBlob, store.settings.unitSystem), `${fileBase(insp)}_report_v${r.version}.pdf`)}>
              <Icon name="download" /> PDF
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
