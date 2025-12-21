// Preset API for variable presets stored in SQLite
// Each preset is tied to a specific template file path

import type { VariableValues } from './variable-utils';

export interface Preset {
  id: number;
  name: string;
  values: VariableValues;
  createdAt: string;
  updatedAt: string;
}

interface PresetRow {
  id: number;
  template_path: string;
  name: string;
  preset_values: string;
  created_at: string;
  updated_at: string;
}

// Get all presets for a template file
export async function getPresets(templatePath: string): Promise<Preset[]> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const rows = await db.select<PresetRow>(
    'SELECT * FROM presets WHERE template_path = ? ORDER BY name',
    [templatePath]
  );

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    values: JSON.parse(row.preset_values),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// Save a preset (create or update)
export async function savePreset(
  templatePath: string,
  name: string,
  values: VariableValues
): Promise<Preset> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  const now = new Date().toISOString();
  const valuesJson = JSON.stringify(values);

  // Use INSERT OR REPLACE to handle both create and update
  await db.execute(
    `INSERT INTO presets (template_path, name, preset_values, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(template_path, name) DO UPDATE SET
       preset_values = excluded.preset_values,
       updated_at = excluded.updated_at`,
    [templatePath, name, valuesJson, now, now]
  );

  // Fetch the saved preset
  const rows = await db.select<PresetRow>(
    'SELECT * FROM presets WHERE template_path = ? AND name = ?',
    [templatePath, name]
  );

  if (rows.length === 0) {
    throw new Error('Failed to save preset');
  }

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    values: JSON.parse(row.preset_values),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Delete a preset
export async function deletePreset(templatePath: string, name: string): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute(
    'DELETE FROM presets WHERE template_path = ? AND name = ?',
    [templatePath, name]
  );
}

// Delete all presets for a template (called when template is deleted)
export async function deletePresetsForTemplate(templatePath: string): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute(
    'DELETE FROM presets WHERE template_path = ?',
    [templatePath]
  );
}

// Delete all presets for templates under a folder (called when folder is deleted)
export async function deletePresetsForFolder(folderPath: string): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  // Match all templates that start with the folder path
  await db.execute(
    'DELETE FROM presets WHERE template_path LIKE ?',
    [folderPath + '/%']
  );
}

// Update template path for presets (called when template is renamed/moved)
export async function updatePresetTemplatePath(
  oldPath: string,
  newPath: string
): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  await db.execute(
    'UPDATE presets SET template_path = ? WHERE template_path = ?',
    [newPath, oldPath]
  );
}

// Update template paths for all presets under a folder (called when folder is renamed/moved)
export async function updatePresetFolderPath(
  oldFolderPath: string,
  newFolderPath: string
): Promise<void> {
  const { getDatabase } = await import('./db/tauri-db');
  const db = await getDatabase();

  // Get all affected presets
  const rows = await db.select<PresetRow>(
    'SELECT * FROM presets WHERE template_path LIKE ?',
    [oldFolderPath + '/%']
  );

  // Update each path
  for (const row of rows) {
    const newTemplatePath = row.template_path.replace(oldFolderPath, newFolderPath);
    await db.execute(
      'UPDATE presets SET template_path = ? WHERE id = ?',
      [newTemplatePath, row.id]
    );
  }
}
