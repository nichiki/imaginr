import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

// 辞書ディレクトリのパス
const DICTIONARY_DIR = path.join(process.cwd(), 'data', 'dictionary');

interface DictionaryValue {
  value: string;
  description?: string;
}

interface DictionaryEntry {
  key: string;
  context: string;
  values: DictionaryValue[];
}

interface DictionaryFile {
  entries: DictionaryEntry[];
}

interface FlatDictionaryEntry {
  key: string;
  context: string;
  value: string;
  description?: string;
  source: 'standard' | 'user';
}

// YAMLファイルを読み込んでフラット化
async function loadDictionaryFiles(
  dir: string,
  source: 'standard' | 'user'
): Promise<FlatDictionaryEntry[]> {
  const entries: FlatDictionaryEntry[] = [];

  try {
    const files = await fs.readdir(dir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        const data = yaml.load(content) as DictionaryFile;

        if (data?.entries && Array.isArray(data.entries)) {
          for (const entry of data.entries) {
            if (entry.key && entry.context && Array.isArray(entry.values)) {
              for (const val of entry.values) {
                entries.push({
                  key: entry.key,
                  context: entry.context,
                  value: val.value,
                  description: val.description,
                  source,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error parsing dictionary file ${file}:`, err);
      }
    }
  } catch (err) {
    // ディレクトリが存在しない場合は空配列を返す
    console.warn(`Dictionary directory not found: ${dir}`);
  }

  return entries;
}

// GET /api/dictionary - 辞書一覧取得
export async function GET() {
  try {
    const standardDir = path.join(DICTIONARY_DIR, 'standard');
    const userDir = path.join(DICTIONARY_DIR, 'user');

    const [standardEntries, userEntries] = await Promise.all([
      loadDictionaryFiles(standardDir, 'standard'),
      loadDictionaryFiles(userDir, 'user'),
    ]);

    // ユーザー辞書を後に追加（同じキー・コンテキストの場合は上書きではなく追加）
    const allEntries = [...standardEntries, ...userEntries];

    return NextResponse.json(allEntries);
  } catch (error) {
    console.error('Error loading dictionary:', error);
    return NextResponse.json({ error: 'Failed to load dictionary' }, { status: 500 });
  }
}
