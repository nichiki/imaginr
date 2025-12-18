import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

// スニペットファイルのパス
const SNIPPETS_FILE = path.join(process.cwd(), 'data', 'snippets', 'snippets.yaml');

export interface Snippet {
  id: string;
  category: string;
  key: string;
  label: string;
  description?: string;
  content: string;
}

interface SnippetsFile {
  snippets: Snippet[];
}

// GET /api/snippets - スニペット一覧取得
export async function GET() {
  try {
    const content = await fs.readFile(SNIPPETS_FILE, 'utf-8');
    const data = yaml.load(content) as SnippetsFile;
    return NextResponse.json(data.snippets || []);
  } catch (error) {
    console.error('Failed to read snippets:', error);
    // ファイルが存在しない場合は空配列を返す
    return NextResponse.json([]);
  }
}

// POST /api/snippets - スニペット作成
export async function POST(request: NextRequest) {
  try {
    const newSnippet: Snippet = await request.json();

    // IDを生成（指定がなければ）
    if (!newSnippet.id) {
      newSnippet.id = `snippet_${Date.now()}`;
    }

    // 既存のスニペットを読み込み
    let snippets: Snippet[] = [];
    try {
      const content = await fs.readFile(SNIPPETS_FILE, 'utf-8');
      const data = yaml.load(content) as SnippetsFile;
      snippets = data.snippets || [];
    } catch {
      // ファイルが存在しない場合は空配列
    }

    // 重複IDチェック
    if (snippets.some((s) => s.id === newSnippet.id)) {
      return NextResponse.json(
        { error: 'Snippet with this ID already exists' },
        { status: 400 }
      );
    }

    // 追加して保存
    snippets.push(newSnippet);
    await saveSnippets(snippets);

    return NextResponse.json(newSnippet, { status: 201 });
  } catch (error) {
    console.error('Failed to create snippet:', error);
    return NextResponse.json(
      { error: 'Failed to create snippet' },
      { status: 500 }
    );
  }
}

// PUT /api/snippets - スニペット更新
export async function PUT(request: NextRequest) {
  try {
    const updatedSnippet: Snippet = await request.json();

    if (!updatedSnippet.id) {
      return NextResponse.json(
        { error: 'Snippet ID is required' },
        { status: 400 }
      );
    }

    // 既存のスニペットを読み込み
    const content = await fs.readFile(SNIPPETS_FILE, 'utf-8');
    const data = yaml.load(content) as SnippetsFile;
    const snippets = data.snippets || [];

    // 更新対象を探す
    const index = snippets.findIndex((s) => s.id === updatedSnippet.id);
    if (index === -1) {
      return NextResponse.json(
        { error: 'Snippet not found' },
        { status: 404 }
      );
    }

    // 更新して保存
    snippets[index] = updatedSnippet;
    await saveSnippets(snippets);

    return NextResponse.json(updatedSnippet);
  } catch (error) {
    console.error('Failed to update snippet:', error);
    return NextResponse.json(
      { error: 'Failed to update snippet' },
      { status: 500 }
    );
  }
}

// DELETE /api/snippets?id=xxx - スニペット削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Snippet ID is required' },
        { status: 400 }
      );
    }

    // 既存のスニペットを読み込み
    const content = await fs.readFile(SNIPPETS_FILE, 'utf-8');
    const data = yaml.load(content) as SnippetsFile;
    const snippets = data.snippets || [];

    // 削除対象を探す
    const index = snippets.findIndex((s) => s.id === id);
    if (index === -1) {
      return NextResponse.json(
        { error: 'Snippet not found' },
        { status: 404 }
      );
    }

    // 削除して保存
    snippets.splice(index, 1);
    await saveSnippets(snippets);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete snippet:', error);
    return NextResponse.json(
      { error: 'Failed to delete snippet' },
      { status: 500 }
    );
  }
}

// スニペットをファイルに保存
async function saveSnippets(snippets: Snippet[]) {
  const data: SnippetsFile = { snippets };
  const yamlContent = yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // 行の折り返しを無効化
    quotingType: '"',
    forceQuotes: false,
  });

  // ディレクトリが存在しない場合は作成
  const dir = path.dirname(SNIPPETS_FILE);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(SNIPPETS_FILE, yamlContent, 'utf-8');
}
