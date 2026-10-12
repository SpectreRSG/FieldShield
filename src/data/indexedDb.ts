/**
 * Offline Storage Manager — IndexedDB implementation of the repositories.
 * All data stays in this browser on this device. Nothing is sent to a server.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  InspectionSchema,
  SettingsSchema,
  TutorialProgressSchema,
  type Inspection,
  type Settings,
  type TutorialProgress
} from '../domain/models';
import type { DataStore } from './repository';

interface FieldShieldDB extends DBSchema {
  inspections: { key: string; value: Inspection };
  blobs: { key: string; value: Blob };
  settings: { key: string; value: Settings };
  tutorials: { key: string; value: TutorialProgress };
}

export const DB_NAME = 'fieldshield';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FieldShieldDB>> | null = null;

function db(): Promise<IDBPDatabase<FieldShieldDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FieldShieldDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('inspections')) database.createObjectStore('inspections', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('blobs')) database.createObjectStore('blobs');
        if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('tutorials')) database.createObjectStore('tutorials', { keyPath: 'id' });
      }
    });
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export async function resetDbConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export class StorageQuotaError extends Error {
  constructor() {
    super('Device storage is full. Export a backup and free space before adding more photos.');
    this.name = 'StorageQuotaError';
  }
}

function wrap(err: unknown): never {
  if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    throw new StorageQuotaError();
  }
  throw err;
}

export function createIndexedDbStore(): DataStore {
  return {
    inspections: {
      async list() {
        const all = await (await db()).getAll('inspections');
        // Validate on read; records that fail are reported rather than silently dropped.
        return all.map((r) => {
          const parsed = InspectionSchema.safeParse(r);
          if (!parsed.success) console.warn('FieldShield: inspection record failed validation', r.id);
          return parsed.success ? parsed.data : r;
        });
      },
      async get(id) {
        const r = await (await db()).get('inspections', id);
        if (!r) return undefined;
        const parsed = InspectionSchema.safeParse(r);
        return parsed.success ? parsed.data : r;
      },
      async put(inspection) {
        try {
          await (await db()).put('inspections', inspection);
        } catch (e) {
          wrap(e);
        }
      },
      async remove(id) {
        await (await db()).delete('inspections', id);
      }
    },
    blobs: {
      async put(key, blob) {
        try {
          await (await db()).put('blobs', blob, key);
        } catch (e) {
          wrap(e);
        }
      },
      async get(key) {
        return (await db()).get('blobs', key);
      },
      async remove(key) {
        await (await db()).delete('blobs', key);
      },
      async keys() {
        return (await (await db()).getAllKeys('blobs')).map(String);
      }
    },
    settings: {
      async getSettings() {
        const s = await (await db()).get('settings', 'settings');
        if (!s) return undefined;
        const parsed = SettingsSchema.safeParse(s);
        return parsed.success ? parsed.data : undefined;
      },
      async putSettings(s) {
        await (await db()).put('settings', s);
      },
      async getTutorials() {
        const all = await (await db()).getAll('tutorials');
        return all.filter((t) => TutorialProgressSchema.safeParse(t).success);
      },
      async putTutorial(p) {
        await (await db()).put('tutorials', p);
      },
      async resetTutorial(id) {
        await (await db()).delete('tutorials', id);
      }
    }
  };
}

export interface StorageStatus {
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (!nav?.storage?.estimate) return { usageBytes: null, quotaBytes: null, persisted: null };
  const est = await nav.storage.estimate();
  const persisted = nav.storage.persisted ? await nav.storage.persisted() : null;
  return { usageBytes: est.usage ?? null, quotaBytes: est.quota ?? null, persisted };
}

/** Ask the browser not to evict FieldShield data under storage pressure (browser decides). */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
