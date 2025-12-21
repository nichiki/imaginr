// Tauri-only SQLite Database connection
// This file should only be dynamically imported in Tauri environment

import { getDatabasePath, joinPath } from '../tauri-utils';

// Unified database interface
export interface UnifiedDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// Tauri SQL database type
interface TauriSqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

let dbInstance: UnifiedDatabase | null = null;
let dbPromise: Promise<UnifiedDatabase> | null = null;

// Tauri database wrapper
class TauriDatabaseWrapper implements UnifiedDatabase {
  constructor(private db: TauriSqlDatabase) {}

  async execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }> {
    return this.db.execute(query, bindValues);
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T[]> {
    return this.db.select<T>(query, bindValues);
  }

  async close(): Promise<void> {
    return this.db.close();
  }
}

async function initTauriDatabase(): Promise<UnifiedDatabase> {
  const Database = await import('@tauri-apps/plugin-sql');
  const dbDir = await getDatabasePath();
  const dbPath = await joinPath(dbDir, 'images.db');

  // Ensure directory exists
  const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
  if (!(await exists(dbDir))) {
    await mkdir(dbDir, { recursive: true });
  }

  const db = await Database.default.load(`sqlite:${dbPath}`) as TauriSqlDatabase;

  // Enable foreign keys
  await db.execute('PRAGMA foreign_keys = ON');

  const wrapper = new TauriDatabaseWrapper(db);

  // Initialize schema
  const { initializeSchemaAsync } = await import('./schema');
  await initializeSchemaAsync(wrapper);

  return wrapper;
}

export async function getDatabase(): Promise<UnifiedDatabase> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = initTauriDatabase();
  dbInstance = await dbPromise;
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null;
}
