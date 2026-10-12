/**
 * Application store. Holds every inspection in memory, writes each change to
 * IndexedDB straight away (in order), and exposes a save status so the user can
 * always see whether their work is stored on the device.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Inspection, Settings, TutorialId, TutorialProgress } from '../domain/models';
import { nowIso } from '../domain/ids';
import type { DataStore } from '../data/repository';
import { createIndexedDbStore, StorageQuotaError } from '../data/indexedDb';
import { addHistory, createInspection, defaultSettings, type NewInspectionInput } from '../services/inspectionRecord';

export interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
  at?: string;
}

export interface StoreValue {
  ready: boolean;
  loadError: string | null;
  data: DataStore;
  inspections: Inspection[];
  settings: Settings;
  tutorials: TutorialProgress[];
  saveStatus: SaveStatus;
  getInspection(id: string): Inspection | undefined;
  createInspection(input: NewInspectionInput): Promise<Inspection>;
  addInspection(insp: Inspection): Promise<void>;
  updateInspection(id: string, mutate: (draft: Inspection) => void, historyAction?: string): Promise<void>;
  deleteInspection(id: string): Promise<void>;
  updateSettings(mutate: (draft: Settings) => void): Promise<void>;
  setTutorial(p: TutorialProgress): Promise<void>;
  resetTutorial(id: TutorialId): Promise<void>;
  putBlob(key: string, blob: Blob): Promise<void>;
  getBlob(key: string): Promise<Blob | undefined>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, dataStore }: { children: ReactNode; dataStore?: DataStore }) {
  const data = useMemo(() => dataStore ?? createIndexedDbStore(), [dataStore]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [tutorials, setTutorials] = useState<TutorialProgress[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });

  // Refs hold the latest values so rapid successive edits never overwrite each other.
  const inspRef = useRef(new Map<string, Inspection>());
  const settingsRef = useRef<Settings>(settings);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, s, t] = await Promise.all([
          data.inspections.list(),
          data.settings.getSettings(),
          data.settings.getTutorials()
        ]);
        if (cancelled) return;
        inspRef.current = new Map(list.map((i) => [i.id, i]));
        setInspections(list);
        const merged = s ?? defaultSettings();
        settingsRef.current = merged;
        setSettings(merged);
        setTutorials(t);
        setReady(true);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const persist = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    setSaveStatus({ state: 'saving' });
    const p = queue.current.then(op);
    queue.current = p.catch(() => undefined);
    return p.then(
      (v) => {
        setSaveStatus({ state: 'saved', at: nowIso() });
        return v;
      },
      (err) => {
        const message =
          err instanceof StorageQuotaError ? err.message : `Could not save to this device: ${err instanceof Error ? err.message : String(err)}`;
        setSaveStatus({ state: 'error', message, at: nowIso() });
        throw err;
      }
    );
  }, []);

  const publish = useCallback(() => {
    setInspections([...inspRef.current.values()]);
  }, []);

  const addInspection = useCallback(
    async (insp: Inspection) => {
      inspRef.current.set(insp.id, insp);
      publish();
      await persist(() => data.inspections.put(insp));
    },
    [data, persist, publish]
  );

  const create = useCallback(
    async (input: NewInspectionInput) => {
      const insp = createInspection(input, settingsRef.current);
      await addInspection(insp);
      return insp;
    },
    [addInspection]
  );

  const updateInspection = useCallback(
    async (id: string, mutate: (draft: Inspection) => void, historyAction?: string) => {
      const current = inspRef.current.get(id);
      if (!current) throw new Error('Inspection not found');
      const draft = structuredClone(current);
      mutate(draft);
      draft.updatedAt = nowIso();
      if (historyAction) addHistory(draft, historyAction);
      inspRef.current.set(id, draft);
      publish();
      await persist(() => data.inspections.put(draft));
    },
    [data, persist, publish]
  );

  const deleteInspection = useCallback(
    async (id: string) => {
      const insp = inspRef.current.get(id);
      inspRef.current.delete(id);
      publish();
      await persist(async () => {
        await data.inspections.remove(id);
        if (insp) {
          for (const p of insp.photos) {
            await data.blobs.remove(p.blobKey);
            await data.blobs.remove(p.thumbKey);
          }
        }
      });
    },
    [data, persist, publish]
  );

  const updateSettings = useCallback(
    async (mutate: (d: Settings) => void) => {
      const draft = structuredClone(settingsRef.current);
      mutate(draft);
      draft.updatedAt = nowIso();
      settingsRef.current = draft;
      setSettings(draft);
      await persist(() => data.settings.putSettings(draft));
    },
    [data, persist]
  );

  const setTutorial = useCallback(
    async (p: TutorialProgress) => {
      setTutorials((prev) => [...prev.filter((x) => x.id !== p.id), p]);
      await data.settings.putTutorial(p);
    },
    [data]
  );

  const resetTutorial = useCallback(
    async (id: TutorialId) => {
      setTutorials((prev) => prev.filter((x) => x.id !== id));
      await data.settings.resetTutorial(id);
    },
    [data]
  );

  const putBlob = useCallback((key: string, blob: Blob) => persist(() => data.blobs.put(key, blob)), [data, persist]);
  const getBlob = useCallback((key: string) => data.blobs.get(key), [data]);

  const value: StoreValue = {
    ready,
    loadError,
    data,
    inspections,
    settings,
    tutorials,
    saveStatus,
    getInspection: (id) => inspRef.current.get(id),
    createInspection: create,
    addInspection,
    updateInspection,
    deleteInspection,
    updateSettings,
    setTutorial,
    resetTutorial,
    putBlob,
    getBlob
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Object URL for a stored blob, cached for the session. */
const urlCache = new Map<string, string>();
export function useBlobUrl(key: string | undefined): string | undefined {
  const { getBlob } = useStore();
  const [url, setUrl] = useState<string | undefined>(key ? urlCache.get(key) : undefined);
  useEffect(() => {
    if (!key) {
      setUrl(undefined);
      return;
    }
    const cached = urlCache.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    getBlob(key).then((b) => {
      if (!alive || !b) return;
      const u = URL.createObjectURL(b);
      urlCache.set(key, u);
      setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [key, getBlob]);
  return url;
}

export function forgetBlobUrl(key: string): void {
  const u = urlCache.get(key);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(key);
}
