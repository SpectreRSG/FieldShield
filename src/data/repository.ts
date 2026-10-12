/**
 * Data access interfaces. The UI only talks to these interfaces, so an
 * authorised backend can later be added by writing another implementation
 * (e.g. a sync-capable repository) without rewriting modules.
 */
import type { Inspection, Settings, TutorialId, TutorialProgress } from '../domain/models';

export interface InspectionRepository {
  list(): Promise<Inspection[]>;
  get(id: string): Promise<Inspection | undefined>;
  put(inspection: Inspection): Promise<void>;
  /** Permanent deletion is only ever triggered by an explicit, confirmed user action. */
  remove(id: string): Promise<void>;
}

export interface BlobRepository {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface SettingsRepository {
  getSettings(): Promise<Settings | undefined>;
  putSettings(s: Settings): Promise<void>;
  getTutorials(): Promise<TutorialProgress[]>;
  putTutorial(p: TutorialProgress): Promise<void>;
  resetTutorial(id: TutorialId): Promise<void>;
}

export interface DataStore {
  inspections: InspectionRepository;
  blobs: BlobRepository;
  settings: SettingsRepository;
}
