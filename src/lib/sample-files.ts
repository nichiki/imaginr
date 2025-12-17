import { FileData } from './yaml-utils';

export const sampleFiles: FileData = {
  'global_base.yaml': `# Global Base - 全体共通設定
meta:
  style: realistic
  genre: high fashion editorial

subject:
  type: human
  sex: female
  age: young adult
  ethnicity: japanese

appearance:
  face:
    eyes:
      color: brown
  hair:
    style: straight
    length: long
    color: chestnut brown

quality:
  rendering: photorealistic
  details:
    - professional photography
    - magazine quality
`,

  'looks/look_01.yaml': `# Look 01 - Midnight Silhouette
look:
  id: "01"
  name: "Midnight Silhouette"
  concept: "黒、影、レイヤード"

mood:
  tone: dark, mysterious
  atmosphere: quiet intensity

lighting:
  key: low-key
  type: directional diffused soft light
  direction: side
  shadow:
    quality: soft
    depth: deep
`,

  'looks/look_02.yaml': `# Look 02 - Urban Poetry
look:
  id: "02"
  name: "Urban Poetry"
  concept: "ストリート、カジュアル、詩的"

mood:
  tone: casual, poetic
  atmosphere: urban minimal

lighting:
  key: natural
  type: soft daylight
  direction: front-side
`,

  'shots/shot_01_01.yaml': `# Shot 01-01 - Midnight Silhouette #1
_base: global_base.yaml
_layers:
  - looks/look_01.yaml

shot:
  number: 1

fashion:
  color_scheme: black monochrome
  outfit:
    - type: long coat
      color: black
      material: matte wool

pose:
  base: standing
  direction: profile

expression:
  type: neutral cool
  eyes:
    direction: forward
`,

  'shots/shot_01_02.yaml': `# Shot 01-02 - Midnight Silhouette #2
_base: global_base.yaml
_layers:
  - looks/look_01.yaml

shot:
  number: 2

fashion:
  color_scheme: black monochrome
  outfit:
    - type: wide pants
      color: matte black
    - type: cropped top
      color: black

pose:
  base: standing
  direction: three-quarter

expression:
  type: averted gaze
`,
};

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeItem[];
}

export function buildFileTree(files: FileData): FileTreeItem[] {
  const tree: FileTreeItem[] = [];
  const folders = new Map<string, FileTreeItem>();

  // ファイルをソート
  const sortedPaths = Object.keys(files).sort();

  for (const path of sortedPaths) {
    const parts = path.split('/');

    if (parts.length === 1) {
      // ルートレベルのファイル
      tree.push({ name: parts[0], path, type: 'file' });
    } else {
      // フォルダ内のファイル
      const folderName = parts[0];

      if (!folders.has(folderName)) {
        const folder: FileTreeItem = {
          name: folderName,
          path: folderName,
          type: 'folder',
          children: [],
        };
        folders.set(folderName, folder);
        tree.push(folder);
      }

      folders.get(folderName)!.children!.push({
        name: parts.slice(1).join('/'),
        path,
        type: 'file',
      });
    }
  }

  return tree;
}
