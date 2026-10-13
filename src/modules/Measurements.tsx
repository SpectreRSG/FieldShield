/**
 * Module 2 — Roof and Room Measurement Calculator.
 * Records dimensions exactly as entered, shows formulas and value sources,
 * keeps measured area separate from waste-adjusted material estimates, and
 * lists missing dimensions instead of guessing them.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  VALUE_SOURCE_LABELS,
  type Dim,
  type Inspection,
  type LengthUnit,
  type Opening,
  type RoofLineKind,
  type RoofPlane,
  type RoofShape,
  type RoomMeasurement,
  type ValueSource
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { useStore } from '../state/store';
import { InspectionWorkspace, useInsp } from '../components/Workspace';
import { BlurInput, Chips, Empty, LengthInput, Notice, Pill, Tabs, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { calcRoom, pitchAngleDegrees, pitchFactor, roofPlaneArea, summarizeRoof } from '../services/measurement';
import { areaUnitLabel, fmtArea, fmtDim, fmtLengthFt, fmtNumber, toFeet } from '../services/units';
import { areaLabel } from '../services/inspectionRecord';
import { buildMeasurementPdf, downloadBlob, downloadText, fileBase, measurementCsv } from '../services/exports';

type Tab = 'roof' | 'rooms' | 'worksheet';
const INPUT_SOURCES: ValueSource[] = ['measured', 'estimated', 'imported'];
const SOURCE_COLOR: Record<ValueSource, string> = { measured: 'green', estimated: 'amber', imported: 'blue', calculated: 'purple' };

export function Measurements() {
  return (
    <InspectionWorkspace module="measure" description="Record roof planes, linear features and room dimensions. Quantities are calculated for your review before manual Xactimate entry.">
      <MeasureBody />
    </InspectionWorkspace>
  );
}

function MeasureBody() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'roof';
  return (
    <>
      <Notice kind="info">
        Type dimensions the way you measure them: <code>12'6"</code>, <code>12.5</code>, <code>150in</code> or <code>3.8m</code>. Blank fields stay
        “not recorded” — nothing is filled in for you.
      </Notice>
      <Tabs<Tab>
        label="Measurement sections"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'roof', label: 'Roof', tour: 'tab-roof' },
          { id: 'rooms', label: 'Rooms', tour: 'tab-rooms' },
          { id: 'worksheet', label: 'Worksheet & export', tour: 'tab-worksheet' }
        ]}
      />
      {tab === 'roof' && <Roof />}
      {tab === 'rooms' && <Rooms />}
      {tab === 'worksheet' && <Worksheet />}
    </>
  );
}

function useUnits() {
  const { settings } = useStore();
  const system = settings.unitSystem;
  const defaultUnit: LengthUnit = system === 'metric' ? 'm' : 'ft';
  return { system, defaultUnit };
}

function dimStr(d: Dim | undefined) {
  return d ? fmtDim(d) : 'not recorded';
}

function SourcePicker({ value, onChange }: { value: ValueSource; onChange: (v: ValueSource) => void }) {
  return (
    <fieldset>
      <legend>Value source</legend>
      <Chips label="Value source" options={INPUT_SOURCES.map((s) => ({ value: s, label: VALUE_SOURCE_LABELS[s] }))} value={[value]} onChange={(v) => onChange(v[0])} />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Roof
// ---------------------------------------------------------------------------
function Roof() {
  const { insp, update } = useInsp();
  const { system, defaultUnit } = useUnits();
  const toast = useToast();
  const confirm = useConfirm();
  const summary = summarizeRoof(insp.roofPlanes, insp.roofLines, insp.wasteScenarios);
  const [lineKind, setLineKind] = useState<RoofLineKind>('eave');
  const [lineLen, setLineLen] = useState<Dim | undefined>();
  const [wasteText, setWasteText] = useState('');

  const addPlane = () => {
    const now = nowIso();
    const p: RoofPlane = {
      id: newId('roof'),
      name: `Plane ${insp.roofPlanes.length + 1}`,
      shape: 'rectangle',
      dimensionBasis: 'slope',
      source: 'measured',
      notes: '',
      revisions: [],
      createdAt: now,
      updatedAt: now
    };
    update((d) => void d.roofPlanes.push(p), `Added roof plane "${p.name}"`);
  };

  const addLine = () => {
    if (!lineLen) return;
    const now = nowIso();
    update(
      (d) => void d.roofLines.push({ id: newId('rl'), kind: lineKind, length: lineLen, source: 'measured', notes: '', revisions: [], createdAt: now, updatedAt: now }),
      `Added ${lineKind} ${fmtDim(lineLen)}`
    );
    setLineLen(undefined);
  };

  const addWaste = () => {
    const n = Number.parseFloat(wasteText);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast('Waste percentage must be between 0 and 100', 'error');
      return;
    }
    update((d) => void (d.wasteScenarios = [...new Set([...d.wasteScenarios, n])].sort((a, b) => a - b)), `Added ${n}% waste scenario`);
    setWasteText('');
  };

  return (
    <>
      <section className="panel" data-tour="roof-summary">
        <div className="panel-head">
          <h2>Roof summary</h2>
          <Pill color={summary.incompletePlanes.length ? 'amber' : 'green'}>
            {summary.completePlanes}/{summary.planeCount} planes complete
          </Pill>
        </div>
        <div className="grid-4">
          <div className="stat">
            <div className="num" data-testid="roof-total">{fmtNumber(system === 'metric' ? summary.totalAreaSqft / 10.7639 : summary.totalAreaSqft)}</div>
            <div className="lbl">Measured roof area ({areaUnitLabel(system)}) <Pill color="purple">Calculated</Pill></div>
          </div>
          <div className="stat">
            <div className="num">{fmtNumber(summary.totalSquares)}</div>
            <div className="lbl">Roofing squares (100 sq ft)</div>
          </div>
          {(['ridge', 'hip', 'valley', 'eave', 'rake'] as RoofLineKind[]).map((k) => (
            <div className="stat" key={k}>
              <div className="num" style={{ fontSize: '1.3rem' }}>{fmtLengthFt(summary.linearTotalsFt[k], system)}</div>
              <div className="lbl">{k[0].toUpperCase() + k.slice(1)} total</div>
            </div>
          ))}
        </div>
        {summary.incompletePlanes.length > 0 && (
          <Notice kind="warn">
            Not included in the total (missing dimensions): {summary.incompletePlanes.map((p) => `${p.name} — ${p.missing.join(', ')}`).join('; ')}
          </Notice>
        )}
        <h3 style={{ marginTop: 12 }}>Material waste scenarios (estimated quantities — not measurements)</h3>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Waste</th>
                <th>Estimated material area</th>
                <th>Squares</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {summary.wasteScenarios.map((w) => (
                <tr key={w.percent}>
                  <td>{w.percent}%</td>
                  <td>{fmtArea(w.areaSqft, system)}</td>
                  <td>{fmtNumber(w.squares)}</td>
                  <td>
                    <button className="btn small ghost" aria-label={`Remove ${w.percent}% scenario`} onClick={() => update((d) => void (d.wasteScenarios = d.wasteScenarios.filter((x) => x !== w.percent)), `Removed ${w.percent}% waste scenario`)}>
                      <Icon name="x" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input inputMode="decimal" value={wasteText} onChange={(e) => setWasteText(e.target.value)} placeholder="Waste %" style={{ width: 120 }} aria-label="Waste percentage" />
          <button className="btn small" onClick={addWaste} disabled={!wasteText}>
            <Icon name="plus" /> Add scenario
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Roof planes</h2>
          <button className="btn accent" onClick={addPlane} data-testid="add-plane" data-tour="add-plane">
            <Icon name="plus" /> Add roof plane
          </button>
        </div>
        {insp.roofPlanes.length === 0 && <Empty icon="measure">No roof planes recorded.</Empty>}
        <div className="grid-2">
          {insp.roofPlanes.map((p) => (
            <PlaneEditor
              key={p.id}
              plane={p}
              insp={insp}
              defaultUnit={defaultUnit}
              system={system}
              onChange={(mut, action) =>
                update((d) => {
                  const t = d.roofPlanes.find((x) => x.id === p.id)!;
                  mut(t);
                  t.updatedAt = nowIso();
                }, action)
              }
              onDelete={async () => {
                if (await confirm({ title: `Delete roof plane "${p.name}"?`, message: 'Linked observations will lose this measurement link.', danger: true, confirmLabel: 'Delete' }))
                  update((d) => {
                    d.roofPlanes = d.roofPlanes.filter((x) => x.id !== p.id);
                    for (const o of d.observations) o.measurementIds = o.measurementIds.filter((m) => m !== p.id);
                  }, `Deleted roof plane "${p.name}"`);
              }}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Ridges, hips, valleys, eaves and rakes</h2>
        <div className="grid-2" style={{ alignItems: 'end' }}>
          <fieldset>
            <legend>Feature</legend>
            <Chips label="Linear feature" options={(['ridge', 'hip', 'valley', 'eave', 'rake'] as RoofLineKind[]).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} value={[lineKind]} onChange={(v) => setLineKind(v[0])} />
          </fieldset>
          <div className="row" style={{ alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <LengthInput label="Length" value={lineLen} onCommit={setLineLen} defaultUnit={defaultUnit} testId="line-length" />
            </div>
            <button className="btn accent" onClick={addLine} disabled={!lineLen} data-testid="add-line">
              <Icon name="plus" /> Add
            </button>
          </div>
        </div>
        {insp.roofLines.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>As entered</th>
                  <th>Length</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {insp.roofLines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.kind}</td>
                    <td>{fmtDim(l.length)}</td>
                    <td>{fmtLengthFt(toFeet(l.length), system)}</td>
                    <td>
                      <Pill color={SOURCE_COLOR[l.source]}>{VALUE_SOURCE_LABELS[l.source]}</Pill>
                    </td>
                    <td>
                      <button className="btn small ghost" aria-label="Delete line" onClick={() => update((d) => void (d.roofLines = d.roofLines.filter((x) => x.id !== l.id)), `Deleted ${l.kind}`)}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function revision(t: { revisions: RoofPlane['revisions'] }, field: string, from: Dim | undefined, to: Dim | undefined) {
  if (from === undefined) return; // first entry is not a revision
  t.revisions.push({ at: nowIso(), field, from: dimStr(from), to: dimStr(to) });
}

function PlaneEditor({
  plane: p,
  insp,
  defaultUnit,
  system,
  onChange,
  onDelete
}: {
  plane: RoofPlane;
  insp: Inspection;
  defaultUnit: LengthUnit;
  system: 'imperial' | 'metric';
  onChange: (m: (t: RoofPlane) => void, action?: string) => void;
  onDelete: () => void;
}) {
  const r = roofPlaneArea(p);
  const [showRev, setShowRev] = useState(false);
  const labels = p.shape === 'rectangle' ? ['Length', 'Width'] : p.shape === 'triangle' ? ['Base', 'Height'] : ['Side A (parallel)', 'Height'];
  const setDim = (field: 'length' | 'length2' | 'width', label: string) => (d: Dim | undefined) =>
    onChange((t) => {
      revision(t, label, t[field], d);
      t[field] = d;
    }, `${p.name}: ${label} ${dimStr(d)}`);
  return (
    <div className="panel stack" style={{ marginBottom: 0 }} data-testid="plane-card">
      <div className="row between">
        <div style={{ flex: 1 }}>
          <BlurInput label="Plane name" value={p.name} onCommit={(v) => onChange((t) => void (t.name = v || t.name), 'Renamed roof plane')} />
        </div>
        <button className="btn small ghost danger" onClick={onDelete} aria-label={`Delete ${p.name}`}>
          <Icon name="trash" />
        </button>
      </div>
      <fieldset>
        <legend>Shape</legend>
        <Chips<RoofShape>
          label="Shape"
          options={[
            { value: 'rectangle', label: 'Rectangle' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'trapezoid', label: 'Trapezoid' }
          ]}
          value={[p.shape]}
          onChange={(v) => onChange((t) => void (t.shape = v[0]), `${p.name}: shape ${v[0]}`)}
        />
      </fieldset>
      <div className="grid-2">
        <LengthInput label={labels[0]} value={p.length} onCommit={setDim('length', labels[0])} defaultUnit={defaultUnit} required testId="plane-length" />
        {p.shape === 'trapezoid' && <LengthInput label="Side B (parallel)" value={p.length2} onCommit={setDim('length2', 'Side B')} defaultUnit={defaultUnit} required />}
        <LengthInput label={labels[1]} value={p.width} onCommit={setDim('width', labels[1])} defaultUnit={defaultUnit} required testId="plane-width" />
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Pitch (rise per 12)</span>
          <select
            value={p.pitchRise ?? ''}
            onChange={(e) => onChange((t) => void (t.pitchRise = e.target.value === '' ? undefined : Number(e.target.value)), `${p.name}: pitch ${e.target.value || 'cleared'}/12`)}
            data-testid="plane-pitch"
          >
            <option value="">— not recorded —</option>
            {Array.from({ length: 25 }, (_, i) => i).map((i) => (
              <option key={i} value={i}>
                {i}/12 ({fmtNumber(pitchAngleDegrees(i), 1)}°, factor {fmtNumber(pitchFactor(i), 3)})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dimensions taken</span>
          <select value={p.dimensionBasis} onChange={(e) => onChange((t) => void (t.dimensionBasis = e.target.value as 'slope' | 'plan'), `${p.name}: ${e.target.value} dimensions`)}>
            <option value="slope">Along the roof surface (slope)</option>
            <option value="plan">Horizontal / from above (plan) — pitch factor applied</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Linked inspection area</span>
        <select value={p.areaId ?? ''} onChange={(e) => onChange((t) => void (t.areaId = e.target.value || undefined), `${p.name}: area linked`)}>
          <option value="">— none —</option>
          {insp.areas
            .filter((a) => a.kind === 'roof_plane' || a.kind === 'roof')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {areaLabel(insp, a.id)}
              </option>
            ))}
        </select>
      </label>
      <SourcePicker value={p.source} onChange={(v) => onChange((t) => void (t.source = v), `${p.name}: source ${v}`)} />
      <div className="formula" data-testid="plane-result">
        {r.value === null ? (
          <>
            <strong style={{ color: 'var(--amber)' }}>Incomplete — missing {r.missing.join(', ')}</strong>
            <br />
            {r.formula}
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--text)' }}>{fmtArea(r.value, system)}</strong> <Pill color="purple">Calculated</Pill>
            <br />
            {r.formula}
          </>
        )}
      </div>
      <BlurInput label="Notes / assumptions" value={p.notes} onCommit={(v) => onChange((t) => void (t.notes = v))} />
      {p.revisions.length > 0 && (
        <div>
          <button className="btn small ghost" onClick={() => setShowRev(!showRev)}>
            {showRev ? 'Hide' : 'Show'} {p.revisions.length} revision(s) to original values
          </button>
          {showRev && (
            <ul className="list" style={{ fontSize: '0.82rem' }}>
              {p.revisions.map((rv, i) => (
                <li key={i}>
                  {new Date(rv.at).toLocaleString()}: {rv.field} {rv.from} → {rv.to}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
function Rooms() {
  const { insp, update } = useInsp();
  const { system, defaultUnit } = useUnits();
  const confirm = useConfirm();
  const levels = [...new Set(insp.rooms.map((r) => r.level || 'No level'))];

  const addRoom = () => {
    const now = nowIso();
    const unmeasured = insp.areas.find((a) => a.kind === 'room' && !insp.rooms.some((r) => r.areaId === a.id));
    const room: RoomMeasurement = {
      id: newId('room'),
      areaId: unmeasured?.id,
      name: unmeasured?.name ?? `Room ${insp.rooms.length + 1}`,
      level: unmeasured?.level ?? '',
      segments: [],
      openings: [],
      source: 'measured',
      notes: '',
      revisions: [],
      createdAt: now,
      updatedAt: now
    };
    update((d) => void d.rooms.push(room), `Added room measurement "${room.name}"`);
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Room measurements</h2>
          <button className="btn accent" onClick={addRoom} data-testid="add-room" data-tour="add-room">
            <Icon name="plus" /> Add room
          </button>
        </div>
        <small>New rooms are linked automatically to the first room area that has no measurement yet. You can change the link.</small>
        {insp.rooms.length === 0 && <Empty icon="measure">No rooms measured yet.</Empty>}
      </section>
      {levels.map((lvl) => (
        <section key={lvl}>
          <h2 style={{ margin: '8px 2px' }}>{lvl}</h2>
          <div className="grid-2">
            {insp.rooms
              .filter((r) => (r.level || 'No level') === lvl)
              .map((r) => (
                <RoomEditor
                  key={r.id}
                  room={r}
                  insp={insp}
                  system={system}
                  defaultUnit={defaultUnit}
                  onChange={(mut, action) =>
                    update((d) => {
                      const t = d.rooms.find((x) => x.id === r.id)!;
                      mut(t);
                      t.updatedAt = nowIso();
                    }, action)
                  }
                  onDelete={async () => {
                    if (await confirm({ title: `Delete room "${r.name}"?`, message: 'Linked observations will lose this measurement link.', danger: true, confirmLabel: 'Delete' }))
                      update((d) => {
                        d.rooms = d.rooms.filter((x) => x.id !== r.id);
                        for (const o of d.observations) o.measurementIds = o.measurementIds.filter((m) => m !== r.id);
                      }, `Deleted room "${r.name}"`);
                  }}
                />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

function RoomEditor({
  room: r,
  insp,
  system,
  defaultUnit,
  onChange,
  onDelete
}: {
  room: RoomMeasurement;
  insp: Inspection;
  system: 'imperial' | 'metric';
  defaultUnit: LengthUnit;
  onChange: (m: (t: RoomMeasurement) => void, action?: string) => void;
  onDelete: () => void;
}) {
  const c = calcRoom(r);
  const [opKind, setOpKind] = useState<Opening['kind']>('door');
  const [opW, setOpW] = useState<Dim | undefined>();
  const [opH, setOpH] = useState<Dim | undefined>();
  const [opQ, setOpQ] = useState(1);
  const [segL, setSegL] = useState<Dim | undefined>();
  const [segW, setSegW] = useState<Dim | undefined>();
  const [segLabel, setSegLabel] = useState('');
  const [segOp, setSegOp] = useState<'add' | 'subtract'>('add');
  const [showIrregular, setShowIrregular] = useState(r.segments.length > 0 || !!r.perimeterOverride);
  const setDim = (field: 'length' | 'width' | 'height' | 'perimeterOverride', label: string) => (d: Dim | undefined) =>
    onChange((t) => {
      revision(t, label, t[field], d);
      t[field] = d;
    }, `${r.name}: ${label} ${dimStr(d)}`);
  const v = (n: number | null) => (n === null ? '—' : fmtArea(n, system));

  return (
    <div className="panel stack" style={{ marginBottom: 0 }} data-testid="room-card">
      <div className="row between">
        <div style={{ flex: 1 }}>
          <BlurInput label="Room name" value={r.name} onCommit={(val) => onChange((t) => void (t.name = val || t.name), 'Renamed room')} />
        </div>
        <button className="btn small ghost danger" onClick={onDelete} aria-label={`Delete ${r.name}`}>
          <Icon name="trash" />
        </button>
      </div>
      <div className="grid-2">
        <BlurInput label="Building level" value={r.level} onCommit={(val) => onChange((t) => void (t.level = val))} />
        <label className="field">
          <span>Linked inspection area</span>
          <select value={r.areaId ?? ''} onChange={(e) => onChange((t) => void (t.areaId = e.target.value || undefined), `${r.name}: area linked`)}>
            <option value="">— none —</option>
            {insp.areas
              .filter((a) => a.kind === 'room' || a.kind === 'other')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {areaLabel(insp, a.id)}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <LengthInput label="Length" value={r.length} onCommit={setDim('length', 'Length')} defaultUnit={defaultUnit} required testId="room-length" />
        <LengthInput label="Width" value={r.width} onCommit={setDim('width', 'Width')} defaultUnit={defaultUnit} required testId="room-width" />
        <LengthInput label="Ceiling ht." value={r.height} onCommit={setDim('height', 'Ceiling height')} defaultUnit={defaultUnit} required testId="room-height" />
      </div>
      <SourcePicker value={r.source} onChange={(val) => onChange((t) => void (t.source = val), `${r.name}: source ${val}`)} />

      <fieldset>
        <legend>Doors, windows and openings ({r.openings.length})</legend>
        {r.openings.map((o) => (
          <div key={o.id} className="row between" style={{ fontSize: '0.88rem' }}>
            <span>
              {o.quantity} × {o.kind} {fmtDim(o.width)} × {fmtDim(o.height)}
            </span>
            <button className="btn small ghost" aria-label="Remove opening" onClick={() => onChange((t) => void (t.openings = t.openings.filter((x) => x.id !== o.id)), `${r.name}: removed ${o.kind}`)}>
              <Icon name="x" />
            </button>
          </div>
        ))}
        <div className="grid-2" style={{ marginTop: 6 }}>
          <label className="field">
            <span>Type</span>
            <select value={opKind} onChange={(e) => setOpKind(e.target.value as Opening['kind'])}>
              <option value="door">Door</option>
              <option value="window">Window</option>
              <option value="opening">Opening</option>
            </select>
          </label>
          <label className="field">
            <span>Quantity</span>
            <input type="number" min={1} value={opQ} onChange={(e) => setOpQ(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <LengthInput label="Width" value={opW} onCommit={setOpW} defaultUnit={defaultUnit} testId="opening-width" />
          <LengthInput label="Height" value={opH} onCommit={setOpH} defaultUnit={defaultUnit} testId="opening-height" />
        </div>
        <button
          className="btn small"
          style={{ marginTop: 6 }}
          disabled={!opW || !opH}
          data-testid="add-opening"
          onClick={() => {
            onChange((t) => void t.openings.push({ id: newId('op'), kind: opKind, width: opW!, height: opH!, quantity: opQ }), `${r.name}: added ${opKind}`);
            setOpW(undefined);
            setOpH(undefined);
            setOpQ(1);
          }}
        >
          <Icon name="plus" /> Add opening
        </button>
      </fieldset>

      <button className="btn small ghost" onClick={() => setShowIrregular(!showIrregular)}>
        {showIrregular ? 'Hide' : 'Show'} irregular room options
      </button>
      {showIrregular && (
        <fieldset>
          <legend>Irregular room — segments and perimeter</legend>
          {r.segments.map((s) => (
            <div key={s.id} className="row between" style={{ fontSize: '0.88rem' }}>
              <span>
                {s.operation === 'add' ? '+' : '−'} {s.label || 'Segment'} {fmtDim(s.length)} × {fmtDim(s.width)}
              </span>
              <button className="btn small ghost" aria-label="Remove segment" onClick={() => onChange((t) => void (t.segments = t.segments.filter((x) => x.id !== s.id)), `${r.name}: removed segment`)}>
                <Icon name="x" />
              </button>
            </div>
          ))}
          <div className="grid-2">
            <label className="field">
              <span>Segment label</span>
              <input value={segLabel} onChange={(e) => setSegLabel(e.target.value)} placeholder="e.g. Nook" />
            </label>
            <label className="field">
              <span>Operation</span>
              <select value={segOp} onChange={(e) => setSegOp(e.target.value as 'add' | 'subtract')}>
                <option value="add">Add area</option>
                <option value="subtract">Subtract area</option>
              </select>
            </label>
            <LengthInput label="Segment length" value={segL} onCommit={setSegL} defaultUnit={defaultUnit} />
            <LengthInput label="Segment width" value={segW} onCommit={setSegW} defaultUnit={defaultUnit} />
          </div>
          <button
            className="btn small"
            style={{ marginTop: 6 }}
            disabled={!segL || !segW}
            onClick={() => {
              onChange((t) => void t.segments.push({ id: newId('seg'), label: segLabel, length: segL!, width: segW!, operation: segOp }), `${r.name}: added segment`);
              setSegL(undefined);
              setSegW(undefined);
              setSegLabel('');
            }}
          >
            <Icon name="plus" /> Add segment
          </button>
          <div style={{ marginTop: 8 }}>
            <LengthInput label="Measured perimeter (needed for walls of irregular rooms)" value={r.perimeterOverride} onCommit={setDim('perimeterOverride', 'Perimeter')} defaultUnit={defaultUnit} />
          </div>
        </fieldset>
      )}

      <div className="table-scroll">
        <table className="data" data-testid="room-results">
          <tbody>
            <tr>
              <th>Floor</th>
              <td>{v(c.floorSqft)}</td>
              <td className="formula">{c.formulas.floor}</td>
            </tr>
            <tr>
              <th>Ceiling</th>
              <td>{v(c.ceilingSqft)}</td>
              <td className="formula">same as floor</td>
            </tr>
            <tr>
              <th>Perimeter</th>
              <td>{c.perimeterFt === null ? '—' : fmtLengthFt(c.perimeterFt, system)}</td>
              <td className="formula">{c.formulas.perimeter}</td>
            </tr>
            <tr>
              <th>Gross wall</th>
              <td>{v(c.grossWallSqft)}</td>
              <td className="formula">{c.formulas.grossWall}</td>
            </tr>
            <tr>
              <th>Openings</th>
              <td>{fmtArea(c.openingsSqft, system)}</td>
              <td className="formula">{c.formulas.openings}</td>
            </tr>
            <tr>
              <th>Adjusted wall</th>
              <td data-testid="room-adjusted">{v(c.adjustedWallSqft)}</td>
              <td className="formula">{c.formulas.adjustedWall}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {c.missing.length > 0 && <Notice kind="warn">Missing: {c.missing.join(', ')}</Notice>}
      {c.warnings.map((w) => (
        <Notice kind="error" key={w}>
          {w}
        </Notice>
      ))}
      <BlurInput label="Notes / assumptions" value={r.notes} onCommit={(val) => onChange((t) => void (t.notes = val))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Worksheet() {
  const { insp } = useInsp();
  const { system } = useUnits();
  const toast = useToast();
  return (
    <section className="panel">
      <h2>Measurement worksheet</h2>
      <p className="muted">
        A review worksheet with every dimension as entered, the formula used, the calculated result and the value source. FieldShield does not
        connect to Xactimate — review the worksheet and enter quantities manually.
      </p>
      <div className="row">
        <button
          className="btn accent"
          data-testid="worksheet-pdf"
          onClick={() => {
            downloadBlob(buildMeasurementPdf(insp, system), `${fileBase(insp)}_measurement-worksheet.pdf`);
            toast('Worksheet PDF downloaded', 'ok');
          }}
        >
          <Icon name="download" /> Download PDF
        </button>
        <button
          className="btn"
          data-testid="worksheet-csv"
          onClick={() => {
            downloadText(measurementCsv(insp, system), `${fileBase(insp)}_measurement-worksheet.csv`);
            toast('Worksheet CSV downloaded', 'ok');
          }}
        >
          <Icon name="download" /> Download CSV
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Icon name="file" /> Print this page
        </button>
      </div>
    </section>
  );
}
