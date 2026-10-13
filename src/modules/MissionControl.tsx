/**
 * Module 1 — Inspection Mission Control.
 * Inspection details, configurable checklists, locations/areas, observations,
 * follow-up tasks, documentation gaps and history.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AREA_KIND_LABELS,
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_STATUS_LABELS,
  INSPECTION_STATUS_LABELS,
  LOSS_TYPE_LABELS,
  OBSERVATION_KIND_LABELS,
  PROPERTY_TYPE_LABELS,
  SHOT_TYPE_LABELS,
  type AreaKind,
  type ChecklistItem,
  type ChecklistPhase,
  type ChecklistStatus,
  type InspectionStatus,
  type LossType,
  type PropertyType,
  type ShotType
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { useStore } from '../state/store';
import { InspectionWorkspace, useInsp } from '../components/Workspace';
import { BlurInput, Chips, Empty, fmtDate, Modal, Notice, Pill, Progress, Tabs, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { ObservationForm } from '../components/ObservationForm';
import { checklistProgress, mergeChecklist } from '../services/checklists';
import { areaLabel, createArea, createStructure } from '../services/inspectionRecord';
import { findConsistencyIssues, findGaps, missingShotTypes, type Gap } from '../services/validation';
import { workflowSteps } from '../services/workflow';

type Tab = 'overview' | 'checklist' | 'areas' | 'followups' | 'gaps' | 'history';

export function MissionControl() {
  return (
    <InspectionWorkspace module="mission" description="Plan, track and complete the inspection: details, checklists, locations, follow-ups and gaps.">
      <MissionBody />
    </InspectionWorkspace>
  );
}

function MissionBody() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  return (
    <>
      <Tabs<Tab>
        label="Mission Control sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview', tour: 'tab-overview' },
          { id: 'checklist', label: 'Checklist', tour: 'tab-checklist' },
          { id: 'areas', label: 'Areas & observations', tour: 'tab-areas' },
          { id: 'followups', label: 'Follow-ups', tour: 'tab-followups' },
          { id: 'gaps', label: 'Gaps & checks', tour: 'tab-gaps' },
          { id: 'history', label: 'History' }
        ]}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'checklist' && <Checklist />}
      {tab === 'areas' && <Areas />}
      {tab === 'followups' && <FollowUps />}
      {tab === 'gaps' && <Gaps />}
      {tab === 'history' && <History />}
    </>
  );
}

// ---------------------------------------------------------------------------
function Overview() {
  const { insp, update } = useInsp();
  const { settings, deleteInspection } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const steps = workflowSteps(insp);
  const next = steps.find((s) => !s.done);
  const p = insp.property;
  const setProp = (k: keyof typeof p, label: string) => (v: string) =>
    update((d) => {
      (d.property[k] as string) = v;
    }, `Updated ${label}`);

  const archive = async () => {
    if (insp.archivedAt) {
      await update((d) => {
        d.archivedAt = undefined;
      }, 'Inspection reopened');
      toast('Inspection reopened', 'ok');
      return;
    }
    const ok = await confirm({
      title: 'Archive this inspection?',
      message: 'Archived inspections are hidden from the active list but are not deleted. You can reopen it at any time.',
      confirmLabel: 'Archive'
    });
    if (ok) {
      await update((d) => {
        d.archivedAt = nowIso();
      }, 'Inspection archived');
      toast('Inspection archived (not deleted)', 'ok');
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Permanently delete this inspection?',
      danger: true,
      confirmLabel: 'Delete permanently',
      message: (
        <>
          <p>
            This removes <strong>{insp.claimNumber}</strong>, its {insp.photos.length} photo(s), notes, measurements, reports and QC
            findings from this device. <strong>It cannot be undone.</strong>
          </p>
          <p>Export a backup or review package first if you may need this record. Archiving is the safer option.</p>
        </>
      )
    });
    if (!ok) return;
    await deleteInspection(insp.id);
    toast('Inspection deleted', 'ok');
    navigate('/');
  };

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div>
        <section className="panel" data-tour="workflow">
          <div className="panel-head">
            <h2>Workflow</h2>
            <Pill color="blue">
              {steps.filter((s) => s.done).length} / {steps.length} steps
            </Pill>
          </div>
          {next && (
            <Notice kind="info">
              Next step: <strong>{next.label}</strong>{' '}
              <Link to={`/i/${insp.id}/${next.module}${next.tab ? `?tab=${next.tab}` : ''}`}>Go there →</Link>
            </Notice>
          )}
          <ol className="list" style={{ paddingLeft: 0 }}>
            {steps.map((s) => (
              <li key={s.n} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <span className={`pill ${s.done ? 'green' : 'gray'}`} style={{ minWidth: 30, justifyContent: 'center' }}>
                  {s.done ? <Icon name="check" size={13} /> : s.n}
                </span>
                <Link to={`/i/${insp.id}/${s.module}${s.tab ? `?tab=${s.tab}` : ''}`} style={{ color: s.done ? 'var(--muted)' : undefined }}>
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div>
        <section className="panel stack">
          <h2>Inspection details</h2>
          <div className="grid-2">
            <BlurInput label="Inspection / claim reference" value={insp.claimNumber} onCommit={(v) => update((d) => void (d.claimNumber = v.trim() || d.claimNumber), 'Updated reference')} />
            <BlurInput label="Title" value={insp.title} onCommit={(v) => update((d) => void (d.title = v), 'Updated title')} />
          </div>
          <label className="field">
            <span>Workflow status</span>
            <select
              value={insp.status}
              onChange={(e) => update((d) => void (d.status = e.target.value as InspectionStatus), `Status set to ${INSPECTION_STATUS_LABELS[e.target.value as InspectionStatus]}`)}
              data-testid="status-select"
            >
              {Object.entries(INSPECTION_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Loss / damage types</legend>
            <Chips
              label="Loss types"
              multi
              options={(Object.keys(LOSS_TYPE_LABELS) as LossType[]).map((l) => ({ value: l, label: LOSS_TYPE_LABELS[l] }))}
              value={insp.lossTypes}
              onChange={(v) =>
                update((d) => {
                  d.lossTypes = v;
                  d.checklist = mergeChecklist(d.checklist, settings.checklistTemplate, v);
                }, `Loss types: ${v.map((l) => LOSS_TYPE_LABELS[l]).join(', ')}`)
              }
            />
            <small>Adding a loss type adds its suggested checklist items. Existing progress is kept.</small>
          </fieldset>
          <div className="grid-2">
            <BlurInput type="date" label="Reported loss date" value={insp.reportedLossDate} onCommit={(v) => update((d) => void (d.reportedLossDate = v), 'Updated loss date')} />
            <BlurInput type="date" label="Inspection date" value={insp.inspectionDate} onCommit={(v) => update((d) => void (d.inspectionDate = v), 'Updated inspection date')} />
          </div>
          {insp.reportedLossDate && insp.inspectionDate && insp.reportedLossDate > insp.inspectionDate && (
            <Notice kind="warn">The reported loss date is after the inspection date.</Notice>
          )}
          <div className="grid-2">
            <BlurInput label="Insured / contact" value={p.insuredName} onCommit={setProp('insuredName', 'contact')} />
            <label className="field">
              <span>Property type</span>
              <select value={p.propertyType} onChange={(e) => update((d) => void (d.property.propertyType = e.target.value as PropertyType), 'Updated property type')}>
                {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <BlurInput label="Street address" value={p.addressLine} onCommit={setProp('addressLine', 'address')} />
          <div className="grid-3">
            <BlurInput label="City" value={p.city} onCommit={setProp('city', 'city')} />
            <BlurInput label="State / region" value={p.state} onCommit={setProp('state', 'state')} />
            <BlurInput label="Postal code" value={p.postalCode} onCommit={setProp('postalCode', 'postal code')} />
          </div>
          <div className="grid-3">
            <BlurInput label="Year built" value={p.yearBuilt} onCommit={setProp('yearBuilt', 'year built')} />
            <BlurInput label="Stories" value={p.stories} onCommit={setProp('stories', 'stories')} />
            <BlurInput label="Roof covering (as observed)" value={p.roofCovering} onCommit={setProp('roofCovering', 'roof covering')} />
          </div>
          <BlurInput label="Property notes" multiline value={p.notes} onCommit={setProp('notes', 'property notes')} />
        </section>
        <section className="panel">
          <h2>Inspection record</h2>
          <dl className="kv">
            <dt>Created</dt>
            <dd>{fmtDate(insp.createdAt)}</dd>
            <dt>Last updated</dt>
            <dd>{fmtDate(insp.updatedAt)}</dd>
            <dt>Record ID</dt>
            <dd>{insp.id}</dd>
          </dl>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={archive} data-testid="archive-toggle">
              <Icon name="archive" /> {insp.archivedAt ? 'Reopen inspection' : 'Archive inspection'}
            </button>
            <button className="btn danger" onClick={remove}>
              <Icon name="trash" /> Delete…
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const STATUS_ORDER: ChecklistStatus[] = ['not_started', 'in_progress', 'completed', 'not_applicable', 'follow_up'];

function Checklist() {
  const { insp, update } = useInsp();
  const toast = useToast();
  const confirm = useConfirm();
  const [newText, setNewText] = useState('');
  const [newPhase, setNewPhase] = useState<ChecklistPhase>('field');
  const [editing, setEditing] = useState<string | null>(null);
  const prog = checklistProgress(insp.checklist);
  const gaps = useMemo(() => findGaps(insp), [insp]);

  const setStatus = (item: ChecklistItem, status: ChecklistStatus) =>
    update((d) => {
      const it = d.checklist.find((x) => x.id === item.id)!;
      it.status = status;
      it.updatedAt = nowIso();
      if (status === 'follow_up' && !d.followUps.some((f) => f.relatedId === item.id && f.status === 'open')) {
        d.followUps.push({ id: newId('fu'), title: `Checklist: ${item.text}`, detail: item.note, status: 'open', dueDate: '', relatedId: item.id, createdAt: nowIso(), updatedAt: nowIso() });
      }
    }, `Checklist "${item.text}" → ${CHECKLIST_STATUS_LABELS[status]}`);

  const add = () => {
    if (!newText.trim()) return;
    const now = nowIso();
    update((d) => {
      d.checklist.push({ id: newId('chk'), phase: newPhase, text: newText.trim(), guidance: '', status: 'not_started', required: false, note: '', origin: 'custom', createdAt: now, updatedAt: now });
    }, `Added checklist item "${newText.trim()}"`);
    setNewText('');
  };

  const completeReview = async (phase: 'pre' | 'departure') => {
    if (phase === 'departure') {
      const real = gaps.filter((g) => g.severity === 'gap');
      if (real.length) {
        const ok = await confirm({
          title: 'Complete departure review with open gaps?',
          message: (
            <>
              <p>{real.length} documentation gap(s) are still open, for example:</p>
              <ul>
                {real.slice(0, 5).map((g) => (
                  <li key={g.key}>{g.message}</li>
                ))}
              </ul>
              <p>You can still complete the review — gaps stay listed so they can be addressed later.</p>
            </>
          ),
          confirmLabel: 'Complete anyway'
        });
        if (!ok) return;
      }
    }
    await update(
      (d) => {
        if (phase === 'pre') d.reviews.preInspectionCompletedAt = nowIso();
        else d.reviews.departureReviewCompletedAt = nowIso();
        if (phase === 'pre' && d.status === 'scheduled') d.status = 'in_progress';
      },
      phase === 'pre' ? 'Pre-inspection review completed' : 'Final departure review completed'
    );
    toast(phase === 'pre' ? 'Pre-inspection review complete' : 'Departure review complete', 'ok');
  };

  return (
    <>
      <section className="panel">
        <div className="row between">
          <div>
            <strong>{prog.percent}% complete</strong> <small>({prog.completed} of {prog.applicable} applicable items; {prog.followUp} need follow-up)</small>
          </div>
          <small>Items are suggestions — mark any that do not apply as “Not applicable”.</small>
        </div>
        <Progress value={prog.percent} />
      </section>
      {(['pre_inspection', 'field', 'departure'] as ChecklistPhase[]).map((phase) => {
        const items = insp.checklist.filter((i) => i.phase === phase);
        return (
          <section className="panel" key={phase} data-tour={`phase-${phase}`}>
            <div className="panel-head">
              <h2>{CHECKLIST_PHASE_LABELS[phase]}</h2>
              {phase === 'pre_inspection' &&
                (insp.reviews.preInspectionCompletedAt ? (
                  <Pill color="green">Reviewed {fmtDate(insp.reviews.preInspectionCompletedAt)}</Pill>
                ) : (
                  <button className="btn small accent" onClick={() => completeReview('pre')} data-testid="complete-pre">
                    Mark pre-inspection complete
                  </button>
                ))}
              {phase === 'departure' &&
                (insp.reviews.departureReviewCompletedAt ? (
                  <Pill color="green">Reviewed {fmtDate(insp.reviews.departureReviewCompletedAt)}</Pill>
                ) : (
                  <button className="btn small accent" onClick={() => completeReview('departure')} data-testid="complete-departure">
                    Complete departure review
                  </button>
                ))}
            </div>
            {phase === 'departure' && (
              <Notice kind={gaps.filter((g) => g.severity === 'gap').length ? 'warn' : 'ok'}>
                Before leaving: {gaps.filter((g) => g.severity === 'gap').length} documentation gap(s) open.{' '}
                <Link to={`/i/${insp.id}/mission?tab=gaps`}>Review gaps</Link>
              </Notice>
            )}
            {items.length === 0 && <Empty>No items in this phase.</Empty>}
            {items.map((item) => (
              <div className="check-item" key={item.id} data-testid="checklist-item">
                <div>
                  <div className="text">
                    {item.text} {item.required && <Pill color="red">Required by you</Pill>}
                  </div>
                  {item.guidance && <small>{item.guidance}</small>}
                  {item.note && <div className="muted" style={{ fontSize: '0.85rem' }}>Note: {item.note}</div>}
                  {editing === item.id && (
                    <div className="stack" style={{ marginTop: 8 }}>
                      <BlurInput label="Note" value={item.note} onCommit={(v) => update((d) => void (d.checklist.find((x) => x.id === item.id)!.note = v))} />
                      <div className="row">
                        <label className="checkline">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(e) => update((d) => void (d.checklist.find((x) => x.id === item.id)!.required = e.target.checked))}
                          />
                          Required for this inspection
                        </label>
                        <label className="field" style={{ minWidth: 200 }}>
                          <span>Area</span>
                          <select value={item.areaId ?? ''} onChange={(e) => update((d) => void (d.checklist.find((x) => x.id === item.id)!.areaId = e.target.value || undefined))}>
                            <option value="">— Whole inspection —</option>
                            {insp.areas.map((a) => (
                              <option key={a.id} value={a.id}>
                                {areaLabel(insp, a.id)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="btn small danger"
                          onClick={async () => {
                            if (await confirm({ title: 'Remove checklist item?', message: `“${item.text}” will be removed from this inspection only.`, confirmLabel: 'Remove', danger: true }))
                              update((d) => void (d.checklist = d.checklist.filter((x) => x.id !== item.id)), `Removed checklist item "${item.text}"`);
                          }}
                        >
                          <Icon name="trash" /> Remove
                        </button>
                      </div>
                    </div>
                  )}
                  {item.areaId && <small>Area: {areaLabel(insp, item.areaId)}</small>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <div className="status-seg" role="group" aria-label={`Status for ${item.text}`}>
                    {STATUS_ORDER.map((s) => (
                      <button key={s} className={`s-${s}`} aria-pressed={item.status === s} onClick={() => setStatus(item, s)}>
                        {CHECKLIST_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <button className="btn small ghost icon-btn small" aria-label="Edit item options" onClick={() => setEditing(editing === item.id ? null : item.id)}>
                    <Icon name="edit" />
                  </button>
                </div>
              </div>
            ))}
          </section>
        );
      })}
      <section className="panel">
        <h3>Add a custom checklist item</h3>
        <div className="grid-2">
          <label className="field">
            <span>Item</span>
            <input value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. Photograph detached garage roof" data-testid="new-check-text" />
          </label>
          <label className="field">
            <span>Phase</span>
            <select value={newPhase} onChange={(e) => setNewPhase(e.target.value as ChecklistPhase)}>
              {Object.entries(CHECKLIST_PHASE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row end" style={{ marginTop: 10 }}>
          <button className="btn accent" onClick={add} disabled={!newText.trim()}>
            <Icon name="plus" /> Add item
          </button>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
function Areas() {
  const { insp, update } = useInsp();
  const { settings } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<AreaKind>('room');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [structureId, setStructureId] = useState(insp.structures[0]?.id ?? '');
  const [observeArea, setObserveArea] = useState<string | null>(null);
  const [newStructure, setNewStructure] = useState('');

  const addArea = () => {
    if (!name.trim()) return;
    const a = createArea(structureId || insp.structures[0].id, kind, name.trim(), settings, level.trim());
    update((d) => void d.areas.push(a), `Added area "${a.name}"`);
    setName('');
    setLevel('');
    setAdding(false);
    toast(`Area "${a.name}" added`, 'ok');
  };

  const removeArea = async (id: string) => {
    const a = insp.areas.find((x) => x.id === id)!;
    const refs =
      insp.observations.filter((o) => o.areaId === id).length +
      insp.photos.filter((p) => p.areaId === id).length +
      insp.rooms.filter((r) => r.areaId === id).length +
      insp.roofPlanes.filter((r) => r.areaId === id).length;
    const ok = await confirm({
      title: `Remove area "${a.name}"?`,
      danger: true,
      confirmLabel: 'Remove area',
      message: refs
        ? `${refs} record(s) are linked to this area. They will be kept but become "Unassigned" so nothing is lost.`
        : 'This area has no linked records.'
    });
    if (!ok) return;
    update((d) => {
      d.areas = d.areas.filter((x) => x.id !== id);
      for (const o of d.observations) if (o.areaId === id) o.areaId = undefined;
      for (const p of d.photos) if (p.areaId === id) p.areaId = undefined;
      for (const r of d.rooms) if (r.areaId === id) r.areaId = undefined;
      for (const r of d.roofPlanes) if (r.areaId === id) r.areaId = undefined;
      for (const l of d.estimate?.lines ?? []) if (l.areaId === id) l.areaId = undefined;
      for (const c of d.checklist) if (c.areaId === id) c.areaId = undefined;
    }, `Removed area "${a.name}"`);
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Structures</h2>
        </div>
        <ul className="list">
          {insp.structures.map((s) => (
            <li key={s.id} className="row between">
              <div style={{ flex: 1, minWidth: 200 }}>
                <BlurInput label="Structure name" value={s.name} onCommit={(v) => v.trim() && update((d) => void (d.structures.find((x) => x.id === s.id)!.name = v.trim()), 'Renamed structure')} />
              </div>
              <small>{insp.areas.filter((a) => a.structureId === s.id).length} area(s)</small>
            </li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: 8 }}>
          <input value={newStructure} onChange={(e) => setNewStructure(e.target.value)} placeholder="e.g. Detached garage" style={{ flex: 1, minWidth: 180 }} aria-label="New structure name" />
          <button
            className="btn"
            disabled={!newStructure.trim()}
            onClick={() => {
              const s = createStructure(newStructure.trim());
              update((d) => void d.structures.push(s), `Added structure "${s.name}"`);
              setNewStructure('');
            }}
          >
            <Icon name="plus" /> Add structure
          </button>
        </div>
      </section>

      <section className="panel" data-tour="areas-list">
        <div className="panel-head">
          <h2>Inspection areas</h2>
          <button className="btn accent" onClick={() => setAdding(true)} data-testid="add-area" data-tour="add-area">
            <Icon name="plus" /> Add area
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Organise the inspection by elevation, roof plane, room or other location. Each area has its own (editable) photo checklist.
        </p>
        {insp.areas.length === 0 && <Empty icon="pin">No areas yet. Add elevations, roof planes or rooms.</Empty>}
        {insp.structures.map((s) => {
          const areas = insp.areas.filter((a) => a.structureId === s.id);
          if (!areas.length) return null;
          return (
            <div key={s.id} style={{ marginBottom: 12 }}>
              {insp.structures.length > 1 && <h3>{s.name}</h3>}
              <div className="grid-2">
                {areas.map((a) => {
                  const obs = insp.observations.filter((o) => o.areaId === a.id);
                  const photos = insp.photos.filter((p) => p.areaId === a.id).length;
                  const missing = missingShotTypes(insp, a.id);
                  return (
                    <div key={a.id} className="panel" style={{ marginBottom: 0 }} data-testid="area-card">
                      <div className="row between">
                        <strong>{a.name}</strong>
                        <Pill color="blue">{AREA_KIND_LABELS[a.kind]}</Pill>
                      </div>
                      {a.level && <small>{a.level}</small>}
                      <div className="row" style={{ gap: 6, margin: '8px 0' }}>
                        <Pill color={obs.length ? 'green' : 'amber'}>{obs.length} note(s)</Pill>
                        <Pill color={photos ? 'green' : 'amber'}>{photos} photo(s)</Pill>
                        {missing.length > 0 && <Pill color="amber">Missing: {missing.map((m) => SHOT_TYPE_LABELS[m]).join(', ')}</Pill>}
                      </div>
                      {obs.slice(-3).map((o) => (
                        <div key={o.id} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                          <Pill color="purple">{OBSERVATION_KIND_LABELS[o.kind]}</Pill> {o.text}
                        </div>
                      ))}
                      <fieldset style={{ marginTop: 8 }}>
                        <legend>Photo checklist for this area</legend>
                        <Chips
                          label="Required photo types"
                          multi
                          options={(['overview', 'context', 'closeup'] as ShotType[]).map((t) => ({ value: t, label: SHOT_TYPE_LABELS[t] }))}
                          value={a.photoRequirements}
                          onChange={(v) => update((d) => void (d.areas.find((x) => x.id === a.id)!.photoRequirements = v), `Photo checklist for ${a.name} updated`)}
                        />
                      </fieldset>
                      <div className="row" style={{ marginTop: 10 }}>
                        <button className="btn small accent" onClick={() => setObserveArea(a.id)} data-testid="area-add-observation">
                          <Icon name="plus" /> Observation
                        </button>
                        <Link className="btn small" to={`/i/${insp.id}/photos?area=${a.id}`}>
                          <Icon name="camera" /> Photos
                        </Link>
                        <button className="btn small ghost danger" onClick={() => removeArea(a.id)} aria-label={`Remove ${a.name}`}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {adding && (
        <Modal
          title="Add inspection area"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={addArea} disabled={!name.trim()} data-testid="area-save">
                Add area
              </button>
            </>
          }
        >
          <div className="stack">
            <fieldset>
              <legend>Type</legend>
              <Chips label="Area type" options={(Object.keys(AREA_KIND_LABELS) as AreaKind[]).map((k) => ({ value: k, label: AREA_KIND_LABELS[k] }))} value={[kind]} onChange={(v) => setKind(v[0])} />
            </fieldset>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'room' ? 'e.g. Kitchen' : kind === 'roof_plane' ? 'e.g. Front slope' : 'e.g. Front elevation'} autoFocus data-testid="area-name" />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Building level (optional)</span>
                <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. Level 1, Basement" />
              </label>
              <label className="field">
                <span>Structure</span>
                <select value={structureId} onChange={(e) => setStructureId(e.target.value)}>
                  {insp.structures.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </Modal>
      )}
      {observeArea && (
        <Modal title={`Observation — ${areaLabel(insp, observeArea)}`} onClose={() => setObserveArea(null)}>
          <ObservationForm
            insp={insp}
            compact
            defaultAreaId={observeArea}
            draftKey={`${insp.id}-mission-obs`}
            onCancel={() => setObserveArea(null)}
            onSave={(o) => {
              update((d) => void d.observations.push(o), `Added ${OBSERVATION_KIND_LABELS[o.kind].toLowerCase()} at ${areaLabel(insp, o.areaId)}`);
              toast('Observation saved', 'ok');
              setObserveArea(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function FollowUps() {
  const { insp, update } = useInsp();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const open = insp.followUps.filter((f) => f.status === 'open');
  const done = insp.followUps.filter((f) => f.status === 'done');
  const add = () => {
    if (!title.trim()) return;
    const now = nowIso();
    update((d) => void d.followUps.push({ id: newId('fu'), title: title.trim(), detail: '', status: 'open', dueDate: due, createdAt: now, updatedAt: now }), `Added follow-up "${title.trim()}"`);
    setTitle('');
    setDue('');
  };
  const toggle = (id: string) =>
    update((d) => {
      const f = d.followUps.find((x) => x.id === id)!;
      f.status = f.status === 'open' ? 'done' : 'open';
      f.updatedAt = nowIso();
    }, 'Follow-up updated');
  return (
    <section className="panel">
      <h2>Outstanding follow-up tasks</h2>
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <label className="field">
          <span>New task</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. Obtain attic access" data-testid="followup-title" />
        </label>
        <label className="field">
          <span>Due date (optional)</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <div className="row end">
        <button className="btn accent" onClick={add} disabled={!title.trim()} data-testid="followup-add">
          <Icon name="plus" /> Add task
        </button>
      </div>
      <h3 style={{ marginTop: 14 }}>Open ({open.length})</h3>
      {open.length === 0 ? <Empty icon="check">No open follow-ups.</Empty> : null}
      <ul className="list">
        {open.map((f) => (
          <li key={f.id} className="row between">
            <label className="checkline" style={{ flex: 1 }}>
              <input type="checkbox" checked={false} onChange={() => toggle(f.id)} />
              <span>
                {f.title}
                {f.dueDate && <small> · due {f.dueDate}</small>}
                {f.detail && <div className="muted" style={{ fontSize: '0.82rem' }}>{f.detail}</div>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Done ({done.length})</h3>
          <ul className="list">
            {done.map((f) => (
              <li key={f.id}>
                <label className="checkline">
                  <input type="checkbox" checked onChange={() => toggle(f.id)} />
                  <s className="muted">{f.title}</s>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
const CAT_LABEL: Record<Gap['category'], string> = {
  photos: 'Photographs',
  measurements: 'Measurements',
  notes: 'Notes & observations',
  reviews: 'Reviews required',
  checklist: 'Checklist'
};

export function GapList({ gaps, inspId }: { gaps: Gap[]; inspId: string }) {
  const cats = Object.keys(CAT_LABEL) as Gap['category'][];
  return (
    <>
      {cats.map((c) => {
        const items = gaps.filter((g) => g.category === c);
        if (!items.length) return null;
        return (
          <div key={c} style={{ marginBottom: 10 }}>
            <h3>
              {CAT_LABEL[c]} <Pill color="amber">{items.length}</Pill>
            </h3>
            {items.map((g) => (
              <div className="gap-item" key={g.key}>
                <Icon name={g.severity === 'gap' ? 'warn' : 'flag'} />
                <div style={{ flex: 1 }}>{g.message}</div>
                <Link to={`/i/${inspId}/${g.module}`} className="btn small">
                  Fix
                </Link>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Gaps() {
  const { insp } = useInsp();
  const gaps = useMemo(() => findGaps(insp), [insp]);
  const issues = useMemo(() => findConsistencyIssues(insp), [insp]);
  return (
    <>
      <section className="panel" data-tour="gaps-panel">
        <div className="panel-head">
          <h2>Documentation completeness</h2>
          <Pill color={gaps.length ? 'amber' : 'green'}>{gaps.length} item(s)</Pill>
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          “Possibly missing” items are prompts, not requirements — every claim is different. Gaps are never filled in automatically.
        </p>
        {gaps.length === 0 ? <Empty icon="check">No documentation gaps detected.</Empty> : <GapList gaps={gaps} inspId={insp.id} />}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Consistency checks</h2>
          <Pill color={issues.length ? 'red' : 'green'}>{issues.length} issue(s)</Pill>
        </div>
        {issues.length === 0 ? (
          <Empty icon="check">No contradictions or unsupported conclusions detected.</Empty>
        ) : (
          issues.map((i) => (
            <div className="gap-item" key={i.id}>
              <Icon name="warn" />
              <div style={{ flex: 1 }}>
                <Pill color={i.severity === 'contradiction' ? 'red' : i.severity === 'warning' ? 'amber' : 'gray'}>{i.severity}</Pill> {i.message}
              </div>
              <Link to={`/i/${insp.id}/notes`} className="btn small">
                Review
              </Link>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function History() {
  const { insp } = useInsp();
  return (
    <section className="panel">
      <h2>Inspection history</h2>
      <ul className="list">
        {[...insp.history].reverse().map((h, i) => (
          <li key={i} className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <span>{h.action}</span>
            <small style={{ whiteSpace: 'nowrap' }}>{fmtDate(h.at)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
