/** Settings, checklist template configuration, storage status and backup/restore. */
import { useEffect, useRef, useState } from 'react';
import {
  AREA_KIND_LABELS,
  CHECKLIST_PHASE_LABELS,
  LOSS_TYPE_LABELS,
  SHOT_TYPE_LABELS,
  type AreaKind,
  type ChecklistPhase,
  type LossType,
  type ShotType
} from '../domain/models';
import { newId } from '../domain/ids';
import { useStore } from '../state/store';
import { BlurInput, Chips, Notice, Pill, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from '../data/indexedDb';
import { buildBackup, downloadText, parseBackup } from '../services/exports';
import { dataUrlToBlob } from '../services/photos';
import { DEFAULT_CHECKLIST_TEMPLATE } from '../services/checklists';

function mb(n: number | null) {
  return n === null ? 'unknown' : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function Settings() {
  const store = useStore();
  const { settings, updateSettings, inspections } = store;
  const toast = useToast();
  const confirm = useConfirm();
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [tplText, setTplText] = useState('');
  const [tplPhase, setTplPhase] = useState<ChecklistPhase>('field');
  const [tplLoss, setTplLoss] = useState<LossType[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStorageStatus().then(setStorage);
  }, [inspections]);

  const backupAll = async () => {
    const b = await buildBackup(inspections, store.getBlob);
    downloadText(JSON.stringify(b), `FieldShield_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    toast(`Backup of ${inspections.length} inspection(s) downloaded`, 'ok');
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setRestoreMsg({ kind: 'info', text: 'Checking backup file…' });
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setRestoreMsg({ kind: 'error', text: `${parsed.error} Nothing was changed.` });
      return;
    }
    const { backup } = parsed;
    const clashes = backup.inspections.filter((i) => inspections.some((x) => x.id === i.id));
    if (clashes.length) {
      const ok = await confirm({
        title: 'Replace existing inspections?',
        message: `${clashes.length} inspection(s) in the backup already exist on this device (${clashes.map((c) => c.claimNumber).join(', ')}). Restoring will replace them with the backup versions.`,
        confirmLabel: 'Replace and restore',
        danger: true
      });
      if (!ok) {
        setRestoreMsg({ kind: 'info', text: 'Restore cancelled. Nothing was changed.' });
        return;
      }
    }
    try {
      // Images first, then records — an interrupted restore never leaves records pointing at missing images.
      for (const [key, dataUrl] of Object.entries(backup.blobs)) await store.putBlob(key, await dataUrlToBlob(dataUrl));
      for (const insp of backup.inspections) await store.addInspection(insp);
      setRestoreMsg({ kind: 'ok', text: `Restored ${backup.inspections.length} inspection(s) and ${Object.keys(backup.blobs).length} image file(s) from ${backup.exportedAt}.` });
    } catch (e) {
      setRestoreMsg({ kind: 'error', text: `Restore stopped: ${e instanceof Error ? e.message : e}. Already-restored items were kept; you can retry safely.` });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="mod-home">
      <div className="module-head">
        <div className="module-icon">
          <Icon name="settings" />
        </div>
        <div>
          <h1>Settings & backup</h1>
          <p>Preferences, checklist templates, storage and backups.</p>
        </div>
      </div>

      <section className="panel stack">
        <h2>Preferences</h2>
        <BlurInput label="Inspector name (shown on reports)" value={settings.inspectorName} onCommit={(v) => updateSettings((s) => void (s.inspectorName = v))} />
        <fieldset>
          <legend>Units for results</legend>
          <Chips
            label="Unit system"
            options={[
              { value: 'imperial', label: 'Feet / square feet' },
              { value: 'metric', label: 'Meters / square meters' }
            ]}
            value={[settings.unitSystem]}
            onChange={(v) => updateSettings((s) => void (s.unitSystem = v[0]))}
          />
          <small>You can always type any unit (ft, in, m) when entering a dimension; the original entry is kept.</small>
        </fieldset>
        <BlurInput
          label="Default waste scenarios for new inspections (%, comma separated)"
          value={settings.defaultWasteScenarios.join(', ')}
          onCommit={(v) => {
            const nums = v.split(',').map((x) => Number.parseFloat(x.trim())).filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
            updateSettings((s) => void (s.defaultWasteScenarios = [...new Set(nums)].sort((a, b) => a - b)));
          }}
        />
        <label className="checkline">
          <input type="checkbox" checked={settings.allowBrowserSpeech} onChange={(e) => updateSettings((s) => void (s.allowBrowserSpeech = e.target.checked))} />
          Allow browser dictation (some browsers send audio to their own speech service)
        </label>
        <label className="checkline">
          <input type="checkbox" checked={settings.acknowledgedDataNotice} onChange={(e) => updateSettings((s) => void (s.acknowledgedDataNotice = e.target.checked))} />
          I understand FieldShield stores data only in this browser and is not an approved records system
        </label>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Checklist template</h2>
          <button
            className="btn small"
            onClick={async () => {
              if (await confirm({ title: 'Reset checklist template?', message: 'Restore the default checklist template? Existing inspections are not changed.', confirmLabel: 'Reset' }))
                updateSettings((s) => void (s.checklistTemplate = DEFAULT_CHECKLIST_TEMPLATE.map((i) => ({ ...i }))));
            }}
          >
            Reset to defaults
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Used when an inspection is created or a loss type is added. Turn items off to stop suggesting them. Items are never mandatory.
        </p>
        {(['pre_inspection', 'field', 'departure'] as ChecklistPhase[]).map((phase) => (
          <div key={phase} style={{ marginBottom: 10 }}>
            <h3>{CHECKLIST_PHASE_LABELS[phase]}</h3>
            {settings.checklistTemplate
              .filter((t) => t.phase === phase)
              .map((t) => (
                <label key={t.id} className="checkline" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={t.enabled} onChange={(e) => updateSettings((s) => void (s.checklistTemplate.find((x) => x.id === t.id)!.enabled = e.target.checked))} />
                  <span>
                    {t.text}{' '}
                    {t.lossTypes.length > 0 ? t.lossTypes.map((l) => <Pill key={l} color="blue">{LOSS_TYPE_LABELS[l]}</Pill>) : <Pill>All loss types</Pill>}
                  </span>
                </label>
              ))}
          </div>
        ))}
        <h3>Add template item</h3>
        <div className="stack">
          <input value={tplText} onChange={(e) => setTplText(e.target.value)} placeholder="Checklist item text" aria-label="Template item text" />
          <select value={tplPhase} onChange={(e) => setTplPhase(e.target.value as ChecklistPhase)} aria-label="Template item phase">
            {Object.entries(CHECKLIST_PHASE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Chips label="Applies to loss types (none = all)" multi options={(Object.keys(LOSS_TYPE_LABELS) as LossType[]).map((l) => ({ value: l, label: LOSS_TYPE_LABELS[l] }))} value={tplLoss} onChange={setTplLoss} />
          <div className="row end">
            <button
              className="btn"
              disabled={!tplText.trim()}
              onClick={() => {
                updateSettings((s) => void s.checklistTemplate.push({ id: newId('tpl'), phase: tplPhase, text: tplText.trim(), guidance: '', lossTypes: tplLoss, enabled: true }));
                setTplText('');
                setTplLoss([]);
              }}
            >
              <Icon name="plus" /> Add to template
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Default photo checklist by area type</h2>
        {(Object.keys(AREA_KIND_LABELS) as AreaKind[]).map((k) => (
          <div key={k} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{AREA_KIND_LABELS[k]}</span>
            <Chips<ShotType>
              label={`Photo checklist for ${AREA_KIND_LABELS[k]}`}
              multi
              options={(['overview', 'context', 'closeup'] as ShotType[]).map((t) => ({ value: t, label: SHOT_TYPE_LABELS[t] }))}
              value={settings.defaultPhotoRequirements[k] ?? []}
              onChange={(v) => updateSettings((s) => void (s.defaultPhotoRequirements[k] = v))}
            />
          </div>
        ))}
      </section>

      <section className="panel stack" data-tour="storage">
        <h2>Storage on this device</h2>
        <dl className="kv">
          <dt>Inspections</dt>
          <dd>{inspections.length}</dd>
          <dt>Used</dt>
          <dd>{mb(storage?.usageBytes ?? null)}</dd>
          <dt>Browser limit</dt>
          <dd>{mb(storage?.quotaBytes ?? null)}</dd>
          <dt>Protected from cleanup</dt>
          <dd>{storage?.persisted === null || storage === null ? 'unknown' : storage.persisted ? 'Yes' : 'No'}</dd>
        </dl>
        {storage?.usageBytes && storage.quotaBytes && storage.usageBytes / storage.quotaBytes > 0.8 && (
          <Notice kind="warn">Storage is over 80% full. Export backups and remove completed inspections you no longer need.</Notice>
        )}
        <Notice kind="info">
          Data is kept in this browser’s storage (IndexedDB). Clearing site data, uninstalling the browser or private/incognito mode can erase it, and
          some browsers remove data from sites that are not used for a while. Keep regular backups. This is not a substitute for an employer-approved
          records-management system.
        </Notice>
        <div className="row">
          <button
            className="btn"
            disabled={storage?.persisted === true}
            onClick={async () => {
              const ok = await requestPersistentStorage();
              toast(ok ? 'Browser agreed to protect FieldShield data' : 'The browser did not grant persistent storage (it decides automatically)', ok ? 'ok' : 'info');
              setStorage(await getStorageStatus());
            }}
          >
            Ask browser to protect data
          </button>
        </div>
      </section>

      <section className="panel stack" data-tour="backup">
        <h2>Backup and restore</h2>
        <p className="muted" style={{ margin: 0 }}>
          A backup is one JSON file containing every inspection and photo on this device. Restoring checks the whole file before changing anything.
        </p>
        <div className="row">
          <button className="btn primary" onClick={backupAll} disabled={inspections.length === 0} data-testid="backup-all">
            <Icon name="download" /> Back up all inspections
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="restore">
            <Icon name="upload" /> Restore from backup
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} data-testid="restore-input" />
        </div>
        {restoreMsg && <Notice kind={restoreMsg.kind === 'ok' ? 'ok' : restoreMsg.kind === 'error' ? 'error' : 'info'}>{restoreMsg.text}</Notice>}
      </section>
    </div>
  );
}
