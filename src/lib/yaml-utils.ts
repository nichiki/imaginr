import yaml from 'js-yaml';

export interface FileData {
  [key: string]: string;
}

export interface ParsedYaml {
  _base?: string;
  _layers?: string[];
  [key: string]: unknown;
}

// ファイル読み込み関数の型
export type FileReader = (path: string) => Promise<string | null>;

// 深いマージ（overlay が base を上書き）
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overlay: Partial<T>
): T {
  const result = { ...base };

  for (const key of Object.keys(overlay) as (keyof T)[]) {
    if (key === '_base' || key === '_layers') continue;

    const baseVal = result[key];
    const overlayVal = overlay[key];

    if (
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      overlayVal &&
      typeof overlayVal === 'object' &&
      !Array.isArray(overlayVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overlayVal as Record<string, unknown>
      ) as T[keyof T];
    } else if (overlayVal !== undefined) {
      result[key] = overlayVal as T[keyof T];
    }
  }

  return result;
}

// ファイルを解決してマージ（同期版 - キャッシュ済みファイル用）
export function resolveAndMerge(
  filename: string,
  files: FileData
): Record<string, unknown> {
  const content = files[filename];
  if (!content) {
    console.warn(`File not found: ${filename}`);
    return {};
  }

  let parsed: ParsedYaml;
  try {
    parsed = yaml.load(content) as ParsedYaml;
  } catch {
    // パースエラーは編集中に頻繁に発生するので、警告レベルで静かに処理
    return {};
  }

  if (!parsed) return {};

  // _base があれば読み込んでマージのベースにする
  let result: Record<string, unknown> = {};
  if (parsed._base) {
    result = resolveAndMerge(parsed._base, files);
  }

  // _layers を順番にマージ
  if (parsed._layers && Array.isArray(parsed._layers)) {
    for (const layerFile of parsed._layers) {
      const layerData = resolveAndMerge(layerFile, files);
      result = deepMerge(result, layerData);
    }
  }

  // 最後に自分自身をマージ
  result = deepMerge(result, parsed as Record<string, unknown>);

  return result;
}

// ファイルを解決してマージ（非同期版 - 動的読み込み）
export async function resolveAndMergeAsync(
  filename: string,
  files: FileData,
  readFile: FileReader
): Promise<Record<string, unknown>> {
  // キャッシュになければ読み込み
  let content = files[filename];
  if (!content) {
    const loaded = await readFile(filename);
    if (!loaded) {
      console.warn(`File not found: ${filename}`);
      return {};
    }
    content = loaded;
    files[filename] = content; // キャッシュに追加
  }

  let parsed: ParsedYaml;
  try {
    parsed = yaml.load(content) as ParsedYaml;
  } catch {
    return {};
  }

  if (!parsed) return {};

  // _base があれば読み込んでマージのベースにする
  let result: Record<string, unknown> = {};
  if (parsed._base) {
    result = await resolveAndMergeAsync(parsed._base, files, readFile);
  }

  // _layers を順番にマージ
  if (parsed._layers && Array.isArray(parsed._layers)) {
    for (const layerFile of parsed._layers) {
      const layerData = await resolveAndMergeAsync(layerFile, files, readFile);
      result = deepMerge(result, layerData);
    }
  }

  // 最後に自分自身をマージ
  result = deepMerge(result, parsed as Record<string, unknown>);

  return result;
}

// オブジェクトをYAML文字列に変換
export function objectToYaml(obj: Record<string, unknown>): string {
  // _base と _layers を除外
  const filtered = Object.fromEntries(
    Object.entries(obj).filter(([key]) => key !== '_base' && key !== '_layers')
  );
  return yaml.dump(filtered, { indent: 2, lineWidth: -1 });
}

// マージ結果からプロンプトテキストを生成
export function generatePromptText(data: Record<string, unknown>): string {
  const parts: string[] = [];

  // Subject
  const subject = data.subject as Record<string, string> | undefined;
  if (subject) {
    parts.push(`${subject.age || ''} ${subject.ethnicity || ''} ${subject.sex || ''}`);
  }

  // Appearance
  const appearance = data.appearance as Record<string, unknown> | undefined;
  if (appearance) {
    const hair = appearance.hair as Record<string, string> | undefined;
    if (hair) {
      parts.push(`${hair.length || ''} ${hair.color || ''} ${hair.style || ''} hair`);
    }
    const face = appearance.face as Record<string, unknown> | undefined;
    const eyes = face?.eyes as Record<string, string> | undefined;
    if (eyes?.color) {
      parts.push(`${eyes.color} eyes`);
    }
  }

  // Pose
  const pose = data.pose as Record<string, string> | undefined;
  if (pose) {
    parts.push(`${pose.base || ''} pose`);
    if (pose.direction) parts.push(pose.direction);
  }

  // Fashion
  const fashion = data.fashion as Record<string, unknown> | undefined;
  if (fashion) {
    if (fashion.color_scheme) parts.push(fashion.color_scheme as string);
    const outfit = fashion.outfit as Record<string, string>[] | undefined;
    if (outfit && Array.isArray(outfit)) {
      outfit.forEach((item) => {
        parts.push(`${item.color || ''} ${item.material || ''} ${item.type || ''}`);
      });
    }
  }

  // Lighting
  const lighting = data.lighting as Record<string, string> | undefined;
  if (lighting) {
    parts.push(`${lighting.key || ''} lighting`);
    if (lighting.type) parts.push(lighting.type);
  }

  // Mood
  const mood = data.mood as Record<string, string> | undefined;
  if (mood) {
    if (mood.tone) parts.push(mood.tone);
    if (mood.atmosphere) parts.push(mood.atmosphere);
  }

  // Quality
  const quality = data.quality as Record<string, unknown> | undefined;
  if (quality) {
    if (quality.rendering) parts.push(quality.rendering as string);
    const details = quality.details as string[] | undefined;
    if (details && Array.isArray(details)) {
      parts.push(...details);
    }
  }

  // 整形して返す
  const cleanParts = parts
    .map((p) => p.trim())
    .filter((p) => p && p !== 'undefined');

  return cleanParts.join(', ');
}
