/**
 * Module 3 — Photo Evidence Organizer.
 * Capture/import, classify, caption, link to observations, annotate (as copies),
 * check photo coverage per area, and build a numbered photo index.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LOSS_TYPE_LABELS,
  OBSERVATION_KIND_LABELS,
  SHOT_TYPE_LABELS,
  type Inspection,
  type LossType,
  type Photo,
  type PhotoAnnotation,
  type ShotType
} from '../domain/models';
import { newId, nowIso } from '../domain/ids';
import { useStore, useBlobUrl, forgetBlobUrl } from '../state/store';
import { InspectionWorkspace, useInsp } from '../components/Workspace';
import { BlurInput, Chips, Empty, fmtDate, Modal, Notice, Pill, Tabs, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { PhotoThumb } from '../components/PhotoThumb';
import { COMPONENT_SUGGESTIONS } from '../components/ObservationForm';
import { areaLabel } from '../services/inspectionRecord';
import { drawAnnotations, newPhotoRecord, processImage, renderAnnotatedCopy, suggestClassification } from '../services/photos';
import { missingShotTypes } from '../services/validation';
import { buildPhotoIndexPdf, downloadBlob, downloadText, fileBase, photoIndexCsv, photoIndexRows } from '../services/exports';
import { StorageQuotaError } from '../data/indexedDb';

type Tab = 'library' | 'coverage' | 'index';
type Filter = 'all' | 'unassigned' | 'review' | 'annotated';

export function Photos() {
  return (
    <InspectionWorkspace module="photos" description="Capture or import photographs, classify them by location and component, link them to observations, and build the photo index.">
      <PhotosBody />
    </InspectionWorkspace>
  );
}

function PhotosBody() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'library';
  return (
    <>
      <Notice kind="info">
        Photographs document conditions at the time they were taken. They do not by themselves establish cause, coverage or repair necessity.
        Originals are stored unchanged; annotations create a separate copy.
      </Notice>
      <Tabs<Tab>
        label="Photo sections"
        value={tab}
        onChange={(t) => {
          const p = new URLSearchParams(params);
          p.set('tab', t);
          setParams(p, { replace: true });
        }}
        tabs={[
          { id: 'library', label: 'Library', tour: 'tab-library' },
          { id: 'coverage', label: 'Coverage checklist', tour: 'tab-coverage' },
          { id: 'index', label: 'Photo index', tour: 'tab-index' }
        ]}
      />
      {tab === 'library' && <Library />}
      {tab === 'coverage' && <Coverage />}
      {tab === 'index' && <PhotoIndex />}
    </>
  );
}

function Library() {
  const { insp, update } = useInsp();
  const store = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // The chosen area is held in local state (updated immediately) as well as the URL, because router URL updates are
  // deferred: a photo imported right after picking an area must be filed into that area, not the previous one.
  const [activeArea, setActiveAreaState] = useState(params.get('area') ?? '');
  const activeAreaRef = useRef(activeArea);
  const urlArea = params.get('area') ?? '';
  useEffect(() => {
    if (urlArea !== activeAreaRef.current) {
      activeAreaRef.current = urlArea;
      setActiveAreaState(urlArea);
    }
  }, [urlArea]);
  const [filter, setFilter] = useState<Filter>('all');
  const [shot, setShot] = useState<ShotType | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const setActiveArea = (id: string) => {
    activeAreaRef.current = id;
    setActiveAreaState(id);
    const p = new URLSearchParams(params);
    if (id) p.set('area', id);
    else p.delete('area');
    setParams(p, { replace: true });
  };

  const handleFiles = async (files: FileList | null, origin: 'camera' | 'import') => {
    if (!files || files.length === 0) return;
    const list = [...files];
    const activeArea = activeAreaRef.current;
    const errs: string[] = [];
    let ok = 0;
    for (const [i, file] of list.entries()) {
      setBusy(`Saving photo ${i + 1} of ${list.length}…`);
      try {
        const processed = await processImage(file);
        // Use the current inspection state for suggestions so batch imports see earlier photos.
        const current = store.getInspection(insp.id) ?? insp;
        const suggestion = suggestClassification(current, file.name, activeArea || undefined);
        const photo = newPhotoRecord({
          fileName: file.name || `photo-${Date.now()}.jpg`,
          mimeType: file.type || 'image/jpeg',
          width: processed.width,
          height: processed.height,
          sizeBytes: file.size,
          origin,
          capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : nowIso(),
          // The area the user chose to file into is an explicit choice, not a suggestion.
          areaId: activeArea || undefined,
          structureId: activeArea ? current.areas.find((a) => a.id === activeArea)?.structureId : undefined,
          suggestion: suggestion ? { ...suggestion, areaId: activeArea ? undefined : suggestion.areaId } : undefined
        });
        if (photo.suggestion && !photo.suggestion.areaId && !photo.suggestion.shotType && !photo.suggestion.component) photo.suggestion = undefined;
        // Write the image first, then the record, so an interruption never leaves a record without its image.
        await store.putBlob(photo.blobKey, processed.original);
        await store.putBlob(photo.thumbKey, processed.thumb);
        await update((d) => void d.photos.push(photo), `${origin === 'camera' ? 'Captured' : 'Imported'} photo ${photo.fileName}`);
        ok += 1;
      } catch (e) {
        if (e instanceof StorageQuotaError) {
          errs.push(e.message);
          break;
        }
        errs.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (ok) toast(`${ok} photo${ok > 1 ? 's' : ''} saved on this device`, 'ok');
    if (cameraRef.current) cameraRef.current.value = '';
    if (importRef.current) importRef.current.value = '';
  };

  const photos = insp.photos
    .filter((p) => !activeArea || p.areaId === activeArea)
    .filter((p) => shot === 'all' || p.shotType === shot)
    .filter((p) =>
      filter === 'all' ? true : filter === 'unassigned' ? !p.areaId : filter === 'review' ? p.suggestion?.status === 'pending' || !p.caption : !p.isOriginal
    );
  const missing = activeArea ? missingShotTypes(insp, activeArea) : [];
  const open = insp.photos.find((p) => p.id === openId);

  return (
    <>
      <section className="panel" data-tour="photo-capture">
        <div className="grid-2" style={{ alignItems: 'end' }}>
          <label className="field">
            <span>File new photos into</span>
            <select value={activeArea} onChange={(e) => setActiveArea(e.target.value)} data-testid="photo-area-filter">
              <option value="">— All areas (no area chosen) —</option>
              {insp.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {areaLabel(insp, a.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="btn accent" onClick={() => cameraRef.current?.click()} disabled={!!busy} data-testid="capture-photo">
              <Icon name="camera" /> Take photo
            </button>
            <button className="btn" onClick={() => importRef.current?.click()} disabled={!!busy} data-testid="import-photos">
              <Icon name="upload" /> Import photos
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFiles(e.target.files, 'camera')} data-testid="camera-input" />
            <input ref={importRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files, 'import')} data-testid="import-input" />
          </div>
        </div>
        {activeArea && (
          <div className="row" style={{ marginTop: 10 }}>
            <small>Photo checklist for this area:</small>
            {insp.areas.find((a) => a.id === activeArea)?.photoRequirements.map((r) => (
              <Pill key={r} color={missing.includes(r) ? 'amber' : 'green'}>
                {missing.includes(r) ? '○' : '✓'} {SHOT_TYPE_LABELS[r]}
              </Pill>
            ))}
          </div>
        )}
        {busy && <Notice kind="info">{busy}</Notice>}
        {errors.length > 0 && (
          <Notice kind="error">
            Some photos were not saved:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
        <small>On phones, “Take photo” opens the camera. Photos stay on this device. Capture time is taken from the file; EXIF data is not read.</small>
      </section>

      <section className="panel">
        <div className="row between" style={{ marginBottom: 10 }}>
          <Chips<Filter>
            label="Filter photos"
            options={[
              { value: 'all', label: `All (${insp.photos.length})` },
              { value: 'unassigned', label: `Unassigned (${insp.photos.filter((p) => !p.areaId).length})` },
              { value: 'review', label: `Needs review (${insp.photos.filter((p) => p.suggestion?.status === 'pending' || !p.caption).length})` },
              { value: 'annotated', label: 'Annotated copies' }
            ]}
            value={[filter]}
            onChange={(v) => setFilter(v[0])}
          />
          <select value={shot} onChange={(e) => setShot(e.target.value as ShotType | 'all')} style={{ width: 'auto' }} aria-label="Shot type filter">
            <option value="all">All shot types</option>
            {Object.entries(SHOT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {photos.length === 0 ? (
          <Empty icon="camera">No photos match. Take or import photos above.</Empty>
        ) : (
          <div className="photo-grid" data-tour="photo-grid">
            {photos.map((p) => (
              <button key={p.id} className="photo-tile" onClick={() => setOpenId(p.id)} data-testid="photo-tile">
                <PhotoThumb photo={p} />
                <span className="num">{insp.photos.indexOf(p) + 1}</span>
                <span className="flags">
                  {!p.isOriginal && <span className="pill purple">Annotated</span>}
                  {p.suggestion?.status === 'pending' && <span className="pill amber">Suggested</span>}
                  {!p.areaId && <span className="pill red">No area</span>}
                </span>
                <span className="cap">
                  <strong>{SHOT_TYPE_LABELS[p.shotType]}</strong> · {p.areaId ? areaLabel(insp, p.areaId) : 'Unassigned'}
                  <br />
                  {p.caption || <em className="muted">No caption</em>}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {open && <PhotoDetail photo={open} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </>
  );
}

function PhotoDetail({ photo: p, onClose, onOpen }: { photo: Photo; onClose: () => void; onOpen: (id: string) => void }) {
  const { insp, update } = useInsp();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [annotating, setAnnotating] = useState(false);
  const n = insp.photos.indexOf(p) + 1;
  const set = (mut: (t: Photo) => void, action?: string) =>
    update((d) => {
      const t = d.photos.find((x) => x.id === p.id)!;
      mut(t);
      t.updatedAt = nowIso();
    }, action);
  const original = p.derivedFromId ? insp.photos.find((x) => x.id === p.derivedFromId) : undefined;
  const copies = insp.photos.filter((x) => x.derivedFromId === p.id);
  const linkable = insp.observations.filter((o) => !p.areaId || o.areaId === p.areaId || o.photoIds.includes(p.id));
  const s = p.suggestion;

  const acceptSuggestion = () =>
    set((t) => {
      if (!t.suggestion) return;
      if (t.suggestion.areaId) {
        t.areaId = t.suggestion.areaId;
        t.structureId = insp.areas.find((a) => a.id === t.suggestion!.areaId)?.structureId;
      }
      if (t.suggestion.shotType) t.shotType = t.suggestion.shotType;
      if (t.suggestion.component && !t.component) t.component = t.suggestion.component;
      t.suggestion.status = 'accepted';
    }, `Accepted suggested classification for photo ${n}`);

  const markCorrected = () =>
    set((t) => {
      if (t.suggestion && t.suggestion.status === 'pending') t.suggestion.status = 'corrected';
    });

  const remove = async () => {
    const linked = insp.observations.filter((o) => o.photoIds.includes(p.id)).length;
    const ok = await confirm({
      title: `Delete photo ${n}?`,
      danger: true,
      confirmLabel: 'Delete photo',
      message: (
        <>
          {p.isOriginal && copies.length > 0 && <p>{copies.length} annotated copy(ies) of this original will be kept.</p>}
          {linked > 0 && <p>It is linked to {linked} observation(s); the links will be removed.</p>}
          <p>The image will be removed from this device. This cannot be undone.</p>
        </>
      )
    });
    if (!ok) return;
    await update((d) => {
      d.photos = d.photos.filter((x) => x.id !== p.id);
      for (const o of d.observations) o.photoIds = o.photoIds.filter((x) => x !== p.id);
    }, `Deleted photo ${p.fileName}`);
    await store.data.blobs.remove(p.blobKey);
    await store.data.blobs.remove(p.thumbKey);
    forgetBlobUrl(p.blobKey);
    forgetBlobUrl(p.thumbKey);
    onClose();
  };

  const downloadOriginal = async () => {
    const b = await store.getBlob(p.blobKey);
    if (b) downloadBlob(b, p.fileName);
  };

  return (
    <Modal title={`Photo ${n}${p.isOriginal ? '' : ' (annotated copy)'}`} onClose={onClose} wide>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <PhotoThumb photo={p} full />
          <div className="row">
            <button className="btn small" onClick={() => setAnnotating(true)} data-testid="annotate">
              <Icon name="edit" /> Annotate (creates copy)
            </button>
            <button className="btn small" onClick={downloadOriginal}>
              <Icon name="download" /> Download {p.isOriginal ? 'original' : 'copy'}
            </button>
            <button className="btn small danger" onClick={remove}>
              <Icon name="trash" /> Delete
            </button>
          </div>
          <dl className="kv">
            <dt>File</dt>
            <dd>{p.fileName}</dd>
            <dt>Version</dt>
            <dd>
              {p.isOriginal ? 'Original (unchanged)' : 'Annotated copy'}
              {original && (
                <>
                  {' '}
                  of{' '}
                  <button className="btn small ghost" onClick={() => onOpen(original.id)}>
                    Photo {insp.photos.indexOf(original) + 1}
                  </button>
                </>
              )}
            </dd>
            {copies.length > 0 && (
              <>
                <dt>Copies</dt>
                <dd>
                  {copies.map((c) => (
                    <button key={c.id} className="btn small ghost" onClick={() => onOpen(c.id)}>
                      Photo {insp.photos.indexOf(c) + 1}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>Captured</dt>
            <dd>{fmtDate(p.capturedAt)}</dd>
            <dt>Added</dt>
            <dd>{fmtDate(p.importedAt)}</dd>
            <dt>Size</dt>
            <dd>
              {p.width} × {p.height}px{p.sizeBytes ? ` · ${(p.sizeBytes / 1024).toFixed(0)} KB` : ''}
            </dd>
            <dt>Source</dt>
            <dd>{p.origin}</dd>
          </dl>
        </div>
        <div className="stack">
          {s && s.status === 'pending' && (
            <div className="notice warn" data-testid="suggestion">
              <Icon name="info" />
              <div>
                <strong>Suggested classification</strong> (not yet applied):{' '}
                {[s.areaId && areaLabel(insp, s.areaId), s.shotType && SHOT_TYPE_LABELS[s.shotType], s.component].filter(Boolean).join(' · ')}
                <br />
                <small>{s.reason}</small>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn small primary" onClick={acceptSuggestion} data-testid="accept-suggestion">
                    Accept
                  </button>
                  <button className="btn small" onClick={markCorrected}>
                    Ignore — I’ll set it myself
                  </button>
                </div>
              </div>
            </div>
          )}
          <label className="field">
            <span>Inspection area</span>
            <select
              value={p.areaId ?? ''}
              onChange={(e) =>
                set((t) => {
                  t.areaId = e.target.value || undefined;
                  t.structureId = insp.areas.find((a) => a.id === e.target.value)?.structureId;
                  if (t.suggestion?.status === 'pending') t.suggestion.status = 'corrected';
                }, `Photo ${n} filed under ${areaLabel(insp, e.target.value || undefined)}`)
              }
              data-testid="photo-area"
            >
              <option value="">— Unassigned —</option>
              {insp.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {areaLabel(insp, a.id)}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Shot type</legend>
            <Chips<ShotType>
              label="Shot type"
              options={(Object.keys(SHOT_TYPE_LABELS) as ShotType[]).map((k) => ({ value: k, label: SHOT_TYPE_LABELS[k] }))}
              value={[p.shotType]}
              onChange={(v) =>
                set((t) => {
                  t.shotType = v[0];
                  if (t.suggestion?.status === 'pending') t.suggestion.status = 'corrected';
                })
              }
            />
          </fieldset>
          <div className="grid-2">
            <label className="field">
              <span>Component</span>
              <input list="fs-components-photo" defaultValue={p.component} key={p.component} onBlur={(e) => e.target.value !== p.component && set((t) => void (t.component = e.target.value))} />
              <datalist id="fs-components-photo">
                {COMPONENT_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Damage category</span>
              <select value={p.damageCategory ?? ''} onChange={(e) => set((t) => void (t.damageCategory = (e.target.value || undefined) as LossType | undefined))}>
                <option value="">— none —</option>
                {Object.entries(LOSS_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <BlurInput label="Caption" value={p.caption} onCommit={(v) => set((t) => void (t.caption = v), `Caption for photo ${n}`)} testId="photo-caption" placeholder="Describe what the photo shows" />
          <BlurInput label="Notes" multiline value={p.notes} onCommit={(v) => set((t) => void (t.notes = v))} />
          <BlurInput
            label="Labels (comma separated)"
            value={p.labels.join(', ')}
            onCommit={(v) => set((t) => void (t.labels = v.split(',').map((x) => x.trim()).filter(Boolean)))}
          />
          <fieldset>
            <legend>Linked observations</legend>
            {linkable.length === 0 && <small>No observations {p.areaId ? 'in this area' : ''} yet.</small>}
            {linkable.map((o) => {
              const on = o.photoIds.includes(p.id);
              return (
                <label key={o.id} className="checkline" style={{ alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      update((d) => {
                        const t = d.observations.find((x) => x.id === o.id)!;
                        t.photoIds = on ? t.photoIds.filter((x) => x !== p.id) : [...t.photoIds, p.id];
                        t.updatedAt = nowIso();
                      }, `${on ? 'Unlinked' : 'Linked'} photo ${n} ${on ? 'from' : 'to'} observation`)
                    }
                  />
                  <span style={{ fontSize: '0.88rem' }}>
                    <Pill color="purple">{OBSERVATION_KIND_LABELS[o.kind]}</Pill> {o.text}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
      </div>
      {annotating && (
        <Annotator
          photo={p}
          onClose={() => setAnnotating(false)}
          onSaved={(id) => {
            setAnnotating(false);
            toast('Annotated copy saved — the original is unchanged', 'ok');
            onOpen(id);
          }}
        />
      )}
    </Modal>
  );
}

type Tool = 'arrow' | 'circle' | 'stroke' | 'text';
const COLORS = ['#ff3b30', '#ffcc00', '#ffffff', '#1f6feb'];

function Annotator({ photo, onClose, onSaved }: { photo: Photo; onClose: () => void; onSaved: (id: string) => void }) {
  const { insp, update } = useInsp();
  const store = useStore();
  const url = useBlobUrl(photo.blobKey);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState<PhotoAnnotation['shapes']>([]);
  const [drawing, setDrawing] = useState<PhotoAnnotation['shapes'][number] | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const c = canvasRef.current!;
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      redraw([]);
    };
    img.src = url;
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const redraw = (list: PhotoAnnotation['shapes']) => {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    drawAnnotations(ctx, list, c.width, c.height);
  };
  useEffect(() => redraw(drawing ? [...shapes, drawing] : shapes)); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: RPointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    const p = pos(e);
    if (tool === 'text') {
      if (!text.trim()) return;
      setShapes([...shapes, { type: 'text', color, points: [p], text: text.trim() }]);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing({ type: tool, color, points: tool === 'stroke' ? [p] : [p, p] });
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const p = pos(e);
    setDrawing(drawing.type === 'stroke' ? { ...drawing, points: [...drawing.points, p] } : { ...drawing, points: [drawing.points[0], p] });
  };
  const up = () => {
    if (drawing) setShapes([...shapes, drawing]);
    setDrawing(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const original = await store.getBlob(photo.blobKey);
      if (!original) throw new Error('Original image not found on this device');
      const out = await renderAnnotatedCopy(original, shapes);
      const annotation: PhotoAnnotation = { id: newId('ann'), sourcePhotoId: photo.id, shapes, createdAt: nowIso() };
      const copy = newPhotoRecord({
        fileName: photo.fileName.replace(/(\.[^.]+)?$/, '_annotated.jpg'),
        mimeType: 'image/jpeg',
        width: out.width,
        height: out.height,
        sizeBytes: out.original.size,
        origin: 'annotation',
        isOriginal: false,
        derivedFromId: photo.id,
        annotationId: annotation.id,
        capturedAt: photo.capturedAt,
        areaId: photo.areaId,
        structureId: photo.structureId,
        component: photo.component,
        damageCategory: photo.damageCategory,
        shotType: photo.shotType,
        caption: photo.caption ? `${photo.caption} (annotated)` : '',
        labels: [...photo.labels, 'annotated']
      });
      await store.putBlob(copy.blobKey, out.original);
      await store.putBlob(copy.thumbKey, out.thumb);
      await update((d) => {
        d.annotations.push(annotation);
        d.photos.push(copy);
      }, `Annotated copy created from photo ${insp.photos.indexOf(photo) + 1}`);
      onSaved(copy.id);
    } catch (e) {
      alert(`Could not save annotation: ${e instanceof Error ? e.message : e}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Annotate photo (saves a copy)"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!shapes.length || saving} data-testid="save-annotation">
            {saving ? 'Saving…' : 'Save annotated copy'}
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <Chips<Tool>
          label="Annotation tool"
          options={[
            { value: 'arrow', label: 'Arrow' },
            { value: 'circle', label: 'Circle' },
            { value: 'stroke', label: 'Draw' },
            { value: 'text', label: 'Text' }
          ]}
          value={[tool]}
          onChange={(v) => setTool(v[0])}
        />
        <div className="row" role="group" aria-label="Colour">
          {COLORS.map((c) => (
            <button key={c} className="chip" aria-pressed={color === c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} style={{ background: c, width: 40, padding: 0, borderColor: color === c ? '#000' : undefined }} />
          ))}
        </div>
        <button className="btn small" onClick={() => setShapes(shapes.slice(0, -1))} disabled={!shapes.length}>
          Undo
        </button>
      </div>
      {tool === 'text' && (
        <label className="field" style={{ marginBottom: 8 }}>
          <span>Text to place (then tap the photo)</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Dent" />
        </label>
      )}
      <canvas ref={canvasRef} className="annot-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="annot-canvas" />
    </Modal>
  );
}

function Coverage() {
  const { insp, update } = useInsp();
  const [, setParams] = useSearchParams();
  const rows = useMemo(
    () =>
      insp.areas.map((a) => ({
        area: a,
        photos: insp.photos.filter((p) => p.areaId === a.id),
        missing: missingShotTypes(insp, a.id)
      })),
    [insp]
  );
  return (
    <section className="panel" data-tour="coverage">
      <h2>Photo coverage by area</h2>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Each area has a configurable photo checklist (overview, context, close-up). “Possibly missing” is a prompt — change the checklist if an
        item doesn’t apply.
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Area</th>
              <th>Photos</th>
              <th>Checklist</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ area, photos, missing }) => (
              <tr key={area.id}>
                <td>{areaLabel(insp, area.id)}</td>
                <td>{photos.length}</td>
                <td>
                  <div className="shot-req">
                    {(['overview', 'context', 'closeup'] as ShotType[]).map((t) => {
                      const req = area.photoRequirements.includes(t);
                      const have = photos.some((p) => p.shotType === t);
                      return (
                        <button
                          key={t}
                          className="chip"
                          aria-pressed={req}
                          title={req ? 'Required — tap to remove from checklist' : 'Not required — tap to add to checklist'}
                          onClick={() =>
                            update((d) => {
                              const ar = d.areas.find((x) => x.id === area.id)!;
                              ar.photoRequirements = req ? ar.photoRequirements.filter((x) => x !== t) : [...ar.photoRequirements, t];
                            }, `Photo checklist for ${area.name} updated`)
                          }
                        >
                          {have ? '✓' : req ? '○' : '–'} {SHOT_TYPE_LABELS[t]}
                        </button>
                      );
                    })}
                  </div>
                  {missing.length > 0 && <small style={{ color: 'var(--amber)' }}>Possibly missing: {missing.map((m) => SHOT_TYPE_LABELS[m]).join(', ')}</small>}
                </td>
                <td>
                  <button className="btn small" onClick={() => setParams({ tab: 'library', area: area.id })}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PhotoIndex() {
  const { insp, update } = useInsp();
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const rows = photoIndexRows(insp);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Numbered photo index</h2>
        <div className="row">
          <button
            className="btn accent"
            disabled={busy}
            data-testid="photo-index-pdf"
            onClick={async () => {
              setBusy(true);
              try {
                downloadBlob(await buildPhotoIndexPdf(insp, store.getBlob), `${fileBase(insp)}_photo-index.pdf`);
                toast('Photo index PDF downloaded', 'ok');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="download" /> {busy ? 'Building…' : 'PDF'}
          </button>
          <button className="btn" onClick={() => downloadText(photoIndexCsv(insp), `${fileBase(insp)}_photo-index.csv`)}>
            <Icon name="download" /> CSV
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Photos are numbered in the order they were added. Move a photo to change its number in reports.
      </p>
      {rows.length === 0 ? (
        <Empty icon="image">No photos yet.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Area</th>
                <th>Shot</th>
                <th>Caption</th>
                <th>Version</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{r.number}</td>
                  <td>{r.area}</td>
                  <td>{r.shot}</td>
                  <td>{r.caption || <em className="muted">none</em>}</td>
                  <td>{r.version}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <MoveButtons insp={insp} index={i} onMove={(from, to) => update((d) => void d.photos.splice(to, 0, d.photos.splice(from, 1)[0]), 'Photo order changed')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MoveButtons({ insp, index, onMove }: { insp: Inspection; index: number; onMove: (from: number, to: number) => void }) {
  return (
    <>
      <button className="btn small ghost" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move up">
        ↑
      </button>
      <button className="btn small ghost" disabled={index === insp.photos.length - 1} onClick={() => onMove(index, index + 1)} aria-label="Move down">
        ↓
      </button>
    </>
  );
}
