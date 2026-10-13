/**
 * Module 5 — Estimate Quality-Control Assistant.
 * Manual entry or CSV import (with column mapping) of estimate lines, then a
 * rules-based review against recorded evidence. Findings explain themselves and
 * are dispositioned by the user. No coverage, approval or settlement decisions.
 */
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FINDING_STATUS_LABELS, type EstimateLine, type FindingStatus, type QCFinding } from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { InspectionWorkspace, useInsp } from '../components/Workspace';
import { Empty, fmtDate, Notice, Pill, Tabs, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { areaLabel } from '../services/inspectionRecord';
import { applyMapping, guessMapping, IMPORT_FIELDS, parseCsv, SAMPLE_ESTIMATE_CSV, type ColumnMapping, type MappedImport, type ParsedCsv } from '../services/estimateImport';
import { lineLabel, RULE_LABELS, runQualityControl, summarizeFindings } from '../services/estimateQC';
import { buildQcPdf, downloadBlob, downloadText, fileBase, qcCsv } from '../services/exports';
import { parseNumber } from '../services/estimateImport';
import { fmtNumber } from '../services/units';
import { DEMO_ESTIMATE_CSV } from '../services/demo';

type Tab = 'estimate' | 'import' | 'findings';

export function EstimateQC() {
  return (
    <InspectionWorkspace module="qc" description="Enter or import estimate lines and compare them with recorded evidence. Findings are prompts for your review — never coverage or payment decisions.">
      <QCBody />
    </InspectionWorkspace>
  );
}

function QCBody() {
  const [params, setParams] = useSearchParams();
  const { insp } = useInsp();
  const tab = (params.get('tab') as Tab) || (insp.estimate ? 'findings' : 'estimate');
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  return (
    <>
      <Notice kind="info">
        FieldShield has <strong>no Xactimate integration</strong>. Enter lines manually or import a CSV/spreadsheet export you are authorised to use.
      </Notice>
      <Tabs<Tab>
        label="Estimate QC sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'estimate', label: 'Estimate lines', tour: 'tab-estimate' },
          { id: 'import', label: 'Import CSV', tour: 'tab-import' },
          { id: 'findings', label: 'QC findings', tour: 'tab-findings' }
        ]}
      />
      {tab === 'estimate' && <EstimateLines />}
      {tab === 'import' && <ImportCsv onDone={() => setTab('estimate')} />}
      {tab === 'findings' && <Findings />}
    </>
  );
}

function ensureEstimate(d: ReturnType<typeof useInsp>['insp']) {
  if (!d.estimate) {
    const now = nowIso();
    d.estimate = { id: newId('est'), name: 'Estimate (manual entry)', source: 'manual', statedTotal: null, lines: [], createdAt: now, updatedAt: now };
  }
  return d.estimate;
}

function NumCell({ value, onCommit, label }: { value: number | null; onCommit: (n: number | null) => void; label: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [bad, setBad] = useState(false);
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={text}
      className={bad ? 'invalid' : ''}
      style={{ minWidth: 80 }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = parseNumber(text);
        if (n !== null && Number.isNaN(n)) {
          setBad(true);
          return;
        }
        setBad(false);
        if (n !== value) onCommit(n);
      }}
    />
  );
}

function EstimateLines() {
  const { insp, update } = useInsp();
  const confirm = useConfirm();
  const est = insp.estimate;
  const setLine = (id: string, mut: (l: EstimateLine) => void) =>
    update((d) => {
      const l = d.estimate!.lines.find((x) => x.id === id)!;
      mut(l);
      l.updatedAt = nowIso();
      d.estimate!.updatedAt = nowIso();
    });
  const addLine = () =>
    update((d) => {
      const e = ensureEstimate(d);
      const now = nowIso();
      e.lines.push({ id: newId('line'), lineNo: String(e.lines.length + 1), description: '', quantity: null, unit: '', unitPrice: null, total: null, component: '', source: 'manual', createdAt: now, updatedAt: now });
    }, 'Added estimate line');
  const sum = est?.lines.reduce((n, l) => n + (l.total ?? 0), 0) ?? 0;

  return (
    <section className="panel" data-tour="estimate-lines">
      <div className="panel-head">
        <h2>{est?.name ?? 'Estimate'}</h2>
        <div className="row">
          <button className="btn accent" onClick={addLine} data-testid="add-line-item">
            <Icon name="plus" /> Add line
          </button>
          {est && (
            <button
              className="btn danger"
              onClick={async () => {
                if (await confirm({ title: 'Remove all estimate data?', message: 'All estimate lines will be removed. Existing QC findings are kept as a record and will be marked as no longer reproduced on the next run.', danger: true, confirmLabel: 'Remove estimate' }))
                  update((d) => void (d.estimate = null), 'Removed estimate data');
              }}
            >
              <Icon name="trash" /> Clear
            </button>
          )}
        </div>
      </div>
      {!est || est.lines.length === 0 ? (
        <Empty icon="qc">No estimate lines. Add lines manually or use “Import CSV”.</Empty>
      ) : (
        <>
          {est.importedFileName && <small>Imported from {est.importedFileName}. Values are labelled “imported”.</small>}
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit price</th>
                  <th>Total</th>
                  <th>Area</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {est.lines.map((l) => {
                  const calc = l.quantity !== null && l.unitPrice !== null ? l.quantity * l.unitPrice : null;
                  const mismatch = calc !== null && l.total !== null && Math.abs(calc - l.total) > 0.01;
                  return (
                    <tr key={l.id} data-testid="estimate-line">
                      <td style={{ width: 60 }}>
                        <input value={l.lineNo} aria-label="Line number" onChange={(e) => setLine(l.id, (x) => void (x.lineNo = e.target.value))} />
                      </td>
                      <td>
                        <input defaultValue={l.description} key={l.description} aria-label="Description" onBlur={(e) => e.target.value !== l.description && setLine(l.id, (x) => void (x.description = e.target.value))} />
                        {l.source === 'imported' && <Pill color="blue">Imported</Pill>}
                      </td>
                      <td>
                        <NumCell label="Quantity" value={l.quantity} onCommit={(n) => setLine(l.id, (x) => void (x.quantity = n))} />
                      </td>
                      <td style={{ width: 80 }}>
                        <input value={l.unit} aria-label="Unit" placeholder="SF" onChange={(e) => setLine(l.id, (x) => void (x.unit = e.target.value))} />
                      </td>
                      <td>
                        <NumCell label="Unit price" value={l.unitPrice} onCommit={(n) => setLine(l.id, (x) => void (x.unitPrice = n))} />
                      </td>
                      <td>
                        <NumCell label="Total" value={l.total} onCommit={(n) => setLine(l.id, (x) => void (x.total = n))} />
                        {mismatch && <small style={{ color: 'var(--red)' }}>qty × price = {fmtNumber(calc!)}</small>}
                      </td>
                      <td>
                        <select value={l.areaId ?? ''} aria-label="Area" onChange={(e) => setLine(l.id, (x) => void (x.areaId = e.target.value || undefined))}>
                          <option value="">—</option>
                          {insp.areas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {areaLabel(insp, a.id)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button className="btn small ghost" aria-label="Delete line" onClick={() => update((d) => void (d.estimate!.lines = d.estimate!.lines.filter((x) => x.id !== l.id)), 'Deleted estimate line')}>
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row between" style={{ marginTop: 10 }}>
            <span>
              Sum of line totals: <strong>{fmtNumber(sum)}</strong>
            </span>
            <label className="row">
              <span className="field-label">Stated estimate total</span>
              <span style={{ width: 140 }}>
                <NumCell label="Stated estimate total" value={est.statedTotal} onCommit={(n) => update((d) => void (d.estimate!.statedTotal = n), 'Updated stated total')} />
              </span>
            </label>
          </div>
        </>
      )}
    </section>
  );
}

function ImportCsv({ onDone }: { onDone: () => void }) {
  const { insp, update } = useInsp();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [error, setError] = useState<string | null>(null);
  const preview: MappedImport | null = useMemo(() => (parsed ? applyMapping(parsed, mapping, insp) : null), [parsed, mapping, insp]);

  const load = (text: string, name: string) => {
    const p = parseCsv(text);
    if (p.headers.length === 0) {
      setError('No columns found. Make sure the first row contains column headings.');
      setParsed(null);
      return;
    }
    setError(null);
    setFileName(name);
    setParsed(p);
    setMapping(guessMapping(p.headers));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError('File is larger than 5 MB.');
      return;
    }
    if (/\.xlsx?$/i.test(f.name)) {
      setError('Excel files are not read directly. In your spreadsheet app choose “Save as / Export → CSV”, then import the CSV.');
      return;
    }
    try {
      load(await f.text(), f.name);
    } catch {
      setError('The file could not be read. Nothing was imported.');
    }
  };

  const confirmImport = async () => {
    if (!preview || preview.lines.length === 0) return;
    await update((d) => {
      const now = nowIso();
      if (mode === 'replace' || !d.estimate) {
        d.estimate = { id: newId('est'), name: `Imported estimate (${fileName})`, source: 'csv_import', importedFileName: fileName, statedTotal: null, lines: preview.lines, createdAt: now, updatedAt: now };
      } else {
        d.estimate.lines.push(...preview.lines);
        d.estimate.updatedAt = now;
      }
    }, `Imported ${preview.lines.length} estimate line(s) from ${fileName}`);
    toast(`${preview.lines.length} line(s) imported`, 'ok');
    setParsed(null);
    onDone();
  };

  return (
    <section className="panel stack" data-tour="import-panel">
      <h2>Import estimate CSV</h2>
      <p className="muted" style={{ margin: 0 }}>
        Step 1: choose a CSV file. Step 2: match its columns to FieldShield fields. Step 3: check the preview and import. Nothing is saved until you
        press Import.
      </p>
      <div className="row">
        <button className="btn accent" onClick={() => fileRef.current?.click()} data-testid="choose-csv">
          <Icon name="upload" /> Choose CSV file
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.txt,.xlsx,.xls" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="csv-input" />
        <button className="btn" onClick={() => downloadText(SAMPLE_ESTIMATE_CSV, 'fieldshield-sample-estimate.csv')}>
          <Icon name="download" /> Sample CSV
        </button>
        {insp.isDemo && (
          <button className="btn" onClick={() => load(DEMO_ESTIMATE_CSV, 'demo-estimate.csv')}>
            Use demo CSV
          </button>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {parsed && (
        <>
          <h3>Map columns — {fileName}</h3>
          <small>{parsed.rows.length} row(s) found. Required fields are marked *.</small>
          {parsed.errors.length > 0 && <Notice kind="warn">{parsed.errors.join('; ')}</Notice>}
          <div className="grid-3" data-tour="mapping">
            {IMPORT_FIELDS.map((f) => (
              <label className="field" key={f.key}>
                <span>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                <select value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })} data-testid={`map-${f.key}`}>
                  <option value="">— not mapped —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {preview && (
            <>
              <h3>Preview ({preview.lines.length} line(s){preview.skipped ? `, ${preview.skipped} blank row(s) skipped` : ''})</h3>
              {preview.rowErrors.length > 0 && (
                <Notice kind="warn">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {preview.rowErrors.slice(0, 12).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Unit price</th>
                      <th>Total</th>
                      <th>Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.slice(0, 50).map((l) => (
                      <tr key={l.id}>
                        <td>{l.lineNo}</td>
                        <td>{l.description}</td>
                        <td>{l.quantity ?? '—'}</td>
                        <td>{l.unit}</td>
                        <td>{l.unitPrice ?? '—'}</td>
                        <td>{l.total ?? '—'}</td>
                        <td>{l.areaId ? areaLabel(insp, l.areaId) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row between">
                <div className="chips">
                  <button className="chip" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>
                    Replace current estimate
                  </button>
                  <button className="chip" aria-pressed={mode === 'append'} onClick={() => setMode('append')} disabled={!insp.estimate}>
                    Append lines
                  </button>
                </div>
                <button className="btn primary" onClick={confirmImport} disabled={preview.lines.length === 0} data-testid="confirm-import">
                  <Icon name="check" /> Import {preview.lines.length} line(s)
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

const STATUS_COLOR: Record<FindingStatus, string> = { open: 'red', reviewed: 'blue', resolved: 'green', not_applicable: 'gray', follow_up: 'orange' };

function Findings() {
  const { insp, update } = useInsp();
  const toast = useToast();
  const [showStale, setShowStale] = useState(false);
  const summary = summarizeFindings(insp.findings);
  const run = async () => {
    const findings = runQualityControl(insp);
    await update((d) => {
      d.findings = findings;
      d.qcLastRunAt = nowIso();
    }, `Ran estimate QC (${findings.filter((f) => !f.stale).length} findings)`);
    toast(`QC complete: ${findings.filter((f) => !f.stale).length} finding(s)`, 'ok');
  };
  const active = insp.findings.filter((f) => showStale || !f.stale);
  const confirmed = active.filter((f) => f.classification === 'confirmed_arithmetic');
  const potential = active.filter((f) => f.classification === 'potential_concern');

  return (
    <>
      <section className="panel" data-tour="run-qc">
        <div className="panel-head">
          <div>
            <h2>Quality-control review</h2>
            <small>{insp.qcLastRunAt ? `Last run ${fmtDate(insp.qcLastRunAt)}` : 'Not run yet'} · {insp.estimate?.lines.length ?? 0} estimate line(s)</small>
          </div>
          <div className="row">
            <button className="btn accent" onClick={run} disabled={!insp.estimate} data-testid="run-qc">
              <Icon name="play" /> {insp.qcLastRunAt ? 'Re-run QC checks' : 'Run QC checks'}
            </button>
            <button className="btn" onClick={() => downloadBlob(buildQcPdf(insp), `${fileBase(insp)}_qc-summary.pdf`)} data-testid="qc-pdf">
              <Icon name="download" /> Summary PDF
            </button>
            <button className="btn" onClick={() => downloadText(qcCsv(insp), `${fileBase(insp)}_qc-findings.csv`)}>
              <Icon name="download" /> CSV
            </button>
          </div>
        </div>
        {!insp.estimate && <Notice kind="warn">Enter or import estimate lines first.</Notice>}
        <div className="grid-4">
          <div className="stat mod-qc">
            <div className="num" data-testid="qc-confirmed">{summary.confirmedArithmetic}</div>
            <div className="lbl">Confirmed arithmetic errors</div>
          </div>
          <div className="stat" style={{ ['--accent' as string]: 'var(--amber)' }}>
            <div className="num" data-testid="qc-potential">{summary.potentialConcerns}</div>
            <div className="lbl">Potential concerns</div>
          </div>
          <div className="stat">
            <div className="num">{summary.byStatus.open}</div>
            <div className="lbl">Open (not dispositioned)</div>
          </div>
          <div className="stat mod-measure">
            <div className="num">{summary.byStatus.resolved + summary.byStatus.reviewed + summary.byStatus.not_applicable}</div>
            <div className="lbl">Reviewed / resolved / N/A</div>
          </div>
        </div>
        {summary.stale > 0 && (
          <label className="checkline">
            <input type="checkbox" checked={showStale} onChange={(e) => setShowStale(e.target.checked)} /> Show {summary.stale} finding(s) no longer reproduced (kept for the record)
          </label>
        )}
      </section>

      <section className="panel">
        <h2>
          Confirmed arithmetic errors <Pill color="red">{confirmed.length}</Pill>
        </h2>
        <small>Numbers in the estimate do not add up. These are factual calculation mismatches.</small>
        {confirmed.length === 0 ? <Empty icon="check">None.</Empty> : confirmed.map((f) => <FindingCard key={f.id} f={f} onUpdate={update} />)}
      </section>
      <section className="panel">
        <h2>
          Potential concerns requiring review <Pill color="amber">{potential.length}</Pill>
        </h2>
        <small>Possible duplicates, quantity differences, missing dimensions, documentation and scope questions. Each needs your judgement.</small>
        {potential.length === 0 ? <Empty icon="check">None.</Empty> : potential.map((f) => <FindingCard key={f.id} f={f} onUpdate={update} />)}
      </section>
    </>
  );
}

function FindingCard({ f, onUpdate }: { f: QCFinding; onUpdate: ReturnType<typeof useInsp>['update'] }) {
  const { insp } = useInsp();
  const [note, setNote] = useState(f.userNote);
  const lines = insp.estimate?.lines.filter((l) => f.relatedIds.includes(l.id)) ?? [];
  const set = (mut: (t: QCFinding) => void, action?: string) =>
    onUpdate((d) => {
      const t = d.findings.find((x) => x.id === f.id)!;
      mut(t);
      t.updatedAt = nowIso();
    }, action);
  return (
    <div className="panel" style={{ marginTop: 10, marginBottom: 0, opacity: f.stale ? 0.65 : 1 }} data-testid="finding">
      <div className="row between">
        <strong>{f.title}</strong>
        <div className="row" style={{ gap: 5 }}>
          <Pill color={f.classification === 'confirmed_arithmetic' ? 'red' : 'amber'}>{RULE_LABELS[f.rule]}</Pill>
          <Pill color={STATUS_COLOR[f.status]}>{FINDING_STATUS_LABELS[f.status]}</Pill>
          {f.stale && <Pill color="gray">No longer reproduced</Pill>}
        </div>
      </div>
      <p style={{ margin: '6px 0', fontSize: '0.9rem' }}>
        <strong>Why: </strong>
        {f.explanation}
      </p>
      {lines.length > 0 && <small>Lines: {lines.map(lineLabel).join(' · ')}</small>}
      <div className="status-seg" style={{ marginTop: 8 }} role="group" aria-label="Disposition">
        {(Object.keys(FINDING_STATUS_LABELS) as FindingStatus[]).map((s) => (
          <button
            key={s}
            className={`s-${s === 'resolved' ? 'completed' : s === 'reviewed' ? 'in_progress' : s === 'open' ? 'not_started' : s}`}
            aria-pressed={f.status === s}
            onClick={() =>
              set((t) => {
                t.status = s;
              }, `QC finding "${f.title}" → ${FINDING_STATUS_LABELS[s]}`)
            }
          >
            {FINDING_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>Reviewer note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== f.userNote && set((t) => void (t.userNote = note))} placeholder="Why this disposition?" />
      </label>
      {f.status === 'follow_up' && !insp.followUps.some((x) => x.relatedId === f.id) && (
        <button
          className="btn small"
          style={{ marginTop: 8 }}
          onClick={() =>
            onUpdate((d) => void d.followUps.push({ id: newId('fu'), title: `QC: ${f.title}`, detail: f.explanation, status: 'open', dueDate: '', relatedId: f.id, createdAt: nowIso(), updatedAt: nowIso() }), 'Follow-up created from QC finding')
          }
        >
          <Icon name="flag" /> Add to follow-up tasks
        </button>
      )}
    </div>
  );
}
