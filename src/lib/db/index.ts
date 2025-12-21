// SQLite Database connection management
// Supports both better-sqlite3 (Node.js/Next.js) and tauri-plugin-sql (Tauri)
// NOTE: This file should only be imported server-side or via dynamic import

import { isTauri, getDatabasePath, joinPath } from '../tauri-utils';

// Unified database interface for both environments
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

// better-sqlite3 database type (minimal interface to avoid importing the module)
interface BetterSqlite3Database {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    all(...params: unknown[]): unknown[];
  };
  pragma(pragma: string): unknown;
  close(): void;
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

// Node.js database wrapper (for development with Next.js)
class NodeDatabaseWrapper implements UnifiedDatabase {
  private db: BetterSqlite3Database;

  constructor(db: BetterSqlite3Database) {
    this.db = db;
  }

  async execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }> {
    const stmt = this.db.prepare(query);
    const result = stmt.run(...(bindValues || []));
    return { rowsAffected: result.changes, lastInsertId: Number(result.lastInsertRowid) };
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(query);
    return stmt.all(...(bindValues || [])) as T[];
  }

  async close(): Promise<void> {
    this.db.close();
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

async function initNodeDatabase(): Promise<UnifiedDatabase> {
  // Dynamic import to prevent bundling in browser
  const Database = (await import('better-sqlite3')).default;
  const path = await import('path');
  const fs = await import('fs');

  const DB_PATH = path.join(process.cwd(), 'data', 'db', 'images.db');
  const dbDir = path.dirname(DB_PATH);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH) as BetterSqlite3Database;
  db.pragma('foreign_keys = ON');

  const wrapper = new NodeDatabaseWrapper(db);

  // Initialize schema
  const { initializeSchemaAsync } = await import('./schema');
  await initializeSchemaAsync(wrapper);

  return wrapper;
}

export async function getDatabase(): Promise<UnifiedDatabase> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  if (isTauri()) {
    dbPromise = initTauriDatabase();
  } else {
    dbPromise = initNodeDatabase();
  }

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
