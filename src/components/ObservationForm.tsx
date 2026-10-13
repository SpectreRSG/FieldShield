/**
 * Shared observation / note editor used by Mission Control, Notes and Photos.
 * The user always chooses what kind of statement they are recording, so direct
 * observations stay separate from reported statements, assumptions and interpretations.
 */
import { useEffect, useRef, useState } from 'react';
import {
  CONDITION_LABELS,
  LOSS_TYPE_LABELS,
  OBSERVATION_KIND_LABELS,
  type Condition,
  type Inspection,
  type LossType,
  type Observation,
  type ObservationKind
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { areaLabel } from '../services/inspectionRecord';
import { useStore } from '../state/store';
import { Chips, Notice, useConfirm, useDraft } from './ui';
import { Icon } from './Icon';
import { PhotoThumb } from './PhotoThumb';

export const COMPONENT_SUGGESTIONS = [
  'Roof covering', 'Ridge cap', 'Flashing', 'Vent', 'Gutter', 'Downspout', 'Siding', 'Fascia', 'Soffit', 'Window', 'Window screen',
  'Door', 'Fence', 'AC condenser', 'Ceiling', 'Ceiling drywall', 'Wall', 'Wall drywall', 'Flooring', 'Carpet', 'Baseboard',
  'Cabinet', 'Insulation', 'Plumbing supply line', 'Drain line', 'Water heater', 'Electrical', 'Contents'
];

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib).
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
function speechCtor(): (new () => SpeechRec) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function SpeechButton({ onText }: { onText: (t: string) => void }) {
  const { settings, updateSettings } = useStore();
  const confirm = useConfirm();
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const Ctor = typeof window !== 'undefined' ? speechCtor() : undefined;
  useEffect(() => () => rec.current?.stop(), []);
  if (!Ctor) {
    return (
      <button type="button" className="btn small" disabled title="Speech-to-text is not supported by this browser">
        <Icon name="mic" /> Dictation unavailable
      </button>
    );
  }
  const start = async () => {
    if (!settings.allowBrowserSpeech) {
      const ok = await confirm({
        title: 'Enable browser dictation?',
        message: (
          <>
            <p>
              Dictation uses your browser&apos;s built-in speech service. In some browsers (for example Chrome) the audio is sent to
              the browser maker&apos;s servers to be transcribed. FieldShield itself never uploads anything.
            </p>
            <p>Only enable this if your employer permits it. You can turn it off again in Settings.</p>
          </>
        ),
        confirmLabel: 'Enable dictation'
      });
      if (!ok) return;
      await updateSettings((s) => {
        s.allowBrowserSpeech = true;
      });
    }
    const r = new Ctor();
    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t.trim()) onText(t.trim());
    };
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? 'Microphone permission was denied.' : `Dictation error: ${e.error}`);
    r.onend = () => setListening(false);
    rec.current = r;
    setErr(null);
    r.start();
    setListening(true);
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      <button
        type="button"
        className={`btn small ${listening ? 'danger' : ''}`}
        onClick={() => (listening ? rec.current?.stop() : start())}
        aria-pressed={listening}
        data-tour="dictate"
      >
        <Icon name="mic" /> {listening ? 'Stop dictation' : 'Dictate'}
      </button>
      {err && <span className="err">{err}</span>}
    </span>
  );
}

export function ObservationForm({
  insp,
  initial,
  defaultAreaId,
  compact,
  onSave,
  onCancel,
  draftKey
}: {
  insp: Inspection;
  initial?: Observation;
  defaultAreaId?: string;
  compact?: boolean;
  onSave: (o: Observation) => void;
  onCancel?: () => void;
  draftKey: string;
}) {
  const [draftText, setDraftText, clearDraft] = useDraft(initial ? `edit-${initial.id}` : draftKey, initial?.text ?? '');
  const [kind, setKind] = useState<ObservationKind>(initial?.kind ?? 'direct_observation');
  const [areaId, setAreaId] = useState<string | undefined>(initial?.areaId ?? defaultAreaId);
  const [component, setComponent] = useState(initial?.component ?? '');
  const [condition, setCondition] = useState<Condition>(initial?.condition ?? 'not_assessed');
  const [damageCategory, setDamageCategory] = useState<LossType | undefined>(initial?.damageCategory);
  const [reportedBy, setReportedBy] = useState(initial?.reportedBy ?? '');
  const [photoIds, setPhotoIds] = useState<string[]>(initial?.photoIds ?? []);
  const [measurementIds, setMeasurementIds] = useState<string[]>(initial?.measurementIds ?? []);
  const [usedSpeech, setUsedSpeech] = useState(initial?.inputMethod === 'speech');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) setAreaId(defaultAreaId);
  }, [defaultAreaId, initial]);

  const measurements = [
    ...insp.roofPlanes.map((p) => ({ id: p.id, label: `Roof plane: ${p.name}` })),
    ...insp.rooms.map((r) => ({ id: r.id, label: `Room: ${r.name}` })),
    ...insp.roofLines.map((l, i) => ({ id: l.id, label: `Roof line ${i + 1}: ${l.kind}` }))
  ];
  const areaPhotos = insp.photos.filter((p) => !areaId || p.areaId === areaId || photoIds.includes(p.id));

  const save = () => {
    if (!draftText.trim()) {
      setError('Enter the observation text. FieldShield never fills in observations for you.');
      return;
    }
    const now = nowIso();
    onSave({
      id: initial?.id ?? newId('obs'),
      kind,
      areaId,
      component: component.trim(),
      condition,
      damageCategory: condition === 'damage_observed' ? damageCategory : undefined,
      text: draftText.trim(),
      reportedBy: kind === 'reported_statement' ? reportedBy.trim() : '',
      inputMethod: usedSpeech ? 'speech' : 'typed',
      photoIds,
      measurementIds,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now
    });
    clearDraft();
    if (!initial) {
      setComponent('');
      setCondition('not_assessed');
      setDamageCategory(undefined);
      setPhotoIds([]);
      setMeasurementIds([]);
      setUsedSpeech(false);
    }
    setError(null);
  };

  return (
    <div className="stack" data-tour="observation-form">
      <fieldset>
        <legend>What kind of note is this?</legend>
        <Chips
          label="Note kind"
          options={(Object.keys(OBSERVATION_KIND_LABELS) as ObservationKind[]).map((k) => ({ value: k, label: OBSERVATION_KIND_LABELS[k] }))}
          value={[kind]}
          onChange={(v) => setKind(v[0])}
        />
      </fieldset>
      <div className="grid-2">
        <label className="field">
          <span>Inspection area</span>
          <select value={areaId ?? ''} onChange={(e) => setAreaId(e.target.value || undefined)} data-testid="obs-area">
            <option value="">— Not assigned —</option>
            {insp.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {areaLabel(insp, a.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Component</span>
          <input list="fs-components" value={component} onChange={(e) => setComponent(e.target.value)} placeholder="e.g. Gutter" data-testid="obs-component" />
          <datalist id="fs-components">
            {COMPONENT_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      {kind === 'reported_statement' && (
        <label className="field">
          <span>Reported by</span>
          <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="e.g. Insured, contractor, tenant" />
        </label>
      )}
      <label className="field">
        <span className="row between">
          <span>Note text</span>
          <SpeechButton
            onText={(t) => {
              setDraftText(draftText ? `${draftText.trimEnd()} ${t}` : t);
              setUsedSpeech(true);
            }}
          />
        </span>
        <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Describe exactly what you saw or were told." data-testid="obs-text" />
        <span className="hint">Unsent text is kept on this device if the app is closed.</span>
      </label>
      <fieldset>
        <legend>Condition</legend>
        <Chips
          label="Condition"
          options={(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
          value={[condition]}
          onChange={(v) => setCondition(v[0])}
        />
        {condition === 'damage_observed' && (
          <label className="field" style={{ marginTop: 8 }}>
            <span>Damage category (optional)</span>
            <select value={damageCategory ?? ''} onChange={(e) => setDamageCategory((e.target.value || undefined) as LossType | undefined)}>
              <option value="">— Not specified —</option>
              {Object.entries(LOSS_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      {!compact && (
        <>
          <fieldset data-tour="link-photos">
            <legend>Link supporting photographs ({photoIds.length} linked)</legend>
            {areaPhotos.length === 0 ? (
              <small>No photos {areaId ? 'in this area' : 'yet'}. Add photos in the Photo Evidence module.</small>
            ) : (
              <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                {areaPhotos.map((p) => {
                  const on = photoIds.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`photo-tile ${on ? 'selected' : ''}`}
                      aria-pressed={on}
                      onClick={() => setPhotoIds(on ? photoIds.filter((x) => x !== p.id) : [...photoIds, p.id])}
                    >
                      <PhotoThumb photo={p} />
                      <span className="num">{insp.photos.indexOf(p) + 1}</span>
                      {on && (
                        <span className="flags">
                          <span className="pill orange">
                            <Icon name="check" size={12} />
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
          {measurements.length > 0 && (
            <fieldset>
              <legend>Link measurements ({measurementIds.length} linked)</legend>
              <div className="chips">
                {measurements.map((m) => {
                  const on = measurementIds.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      className="chip"
                      aria-pressed={on}
                      onClick={() => setMeasurementIds(on ? measurementIds.filter((x) => x !== m.id) : [...measurementIds, m.id])}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row end">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="btn accent" onClick={save} data-testid="obs-save">
          <Icon name="check" /> {initial ? 'Save changes' : 'Add note'}
        </button>
      </div>
    </div>
  );
}
