// 変数ユーティリティ

export interface VariableDefinition {
  name: string;
  defaultValue?: string;
  yamlPath?: string; // YAMLパス (例: "outfit.jacket.style")
  isMulti?: boolean; // 複数選択可能な変数 (${varName[]} 形式)
}

export interface VariableValues {
  [name: string]: string | string[];
}

// YAMLコンテンツから変数を抽出（パス情報なし、後方互換）
// 形式: ${varName} または ${varName|defaultValue}
export function extractVariables(content: string): VariableDefinition[] {
  const variablePattern = /\$\{([^}|]+)(?:\|([^}]*))?\}/g;
  const variables: Map<string, VariableDefinition> = new Map();

  let match;
  while ((match = variablePattern.exec(content)) !== null) {
    const name = match[1].trim();
    const defaultValue = match[2]?.trim();

    // 同じ変数名は最初の定義を使用（デフォルト値がある方を優先）
    if (!variables.has(name) || (defaultValue && !variables.get(name)?.defaultValue)) {
      variables.set(name, { name, defaultValue });
    }
  }

  return Array.from(variables.values());
}

// YAMLオブジェクトから変数を抽出（パス情報付き）
// パースされたYAMLを走査して、各変数のコンテキストパスを記録
// 形式: ${varName}, ${varName|default}, ${varName[]}, ${varName[]|default}
export function extractVariablesWithPath(
  obj: unknown,
  currentPath: string[] = []
): VariableDefinition[] {
  const variables: Map<string, VariableDefinition> = new Map();
  // [] をオプションでキャプチャ: ${name} or ${name[]} or ${name|default} or ${name[]|default}
  const variablePattern = /\$\{([^}\[\]|]+)(\[\])?(?:\|([^}]*))?\}/g;

  function traverse(value: unknown, path: string[]) {
    if (typeof value === 'string') {
      let match;
      while ((match = variablePattern.exec(value)) !== null) {
        const name = match[1].trim();
        const isMulti = match[2] === '[]';
        const defaultValue = match[3]?.trim();
        const yamlPath = path.join('.');

        // 同じ変数名は最初の定義を使用（デフォルト値がある方を優先）
        if (!variables.has(name) || (defaultValue && !variables.get(name)?.defaultValue)) {
          variables.set(name, { name, defaultValue, yamlPath, isMulti });
        }
      }
      // Reset regex lastIndex for next string
      variablePattern.lastIndex = 0;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        traverse(item, [...path, String(index)]);
      });
    } else if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        // _base, _layers, _replace はスキップ
        if (key.startsWith('_')) continue;
        traverse(val, [...path, key]);
      }
    }
  }

  traverse(obj, currentPath);
  return Array.from(variables.values());
}

// 変数を値で置換
// 配列変数 ${varName[]} は YAML 配列形式に展開
export function resolveVariables(
  content: string,
  values: VariableValues
): string {
  return content.replace(
    /\$\{([^}\[\]|]+)(\[\])?(?:\|([^}]*))?\}/g,
    (match, name, isMultiBracket, defaultValue) => {
      const varName = name.trim();
      const value = values[varName];

      // 配列変数の場合
      if (isMultiBracket === '[]') {
        const arrValue = Array.isArray(value) ? value : [];
        if (arrValue.length === 0) {
          return ''; // 空配列は空文字列（後で除去される）
        }
        // 配列要素を改行 + インデント + ハイフンで展開
        return '\n' + arrValue.map(v => `  - ${v}`).join('\n');
      }

      // 通常の変数
      if (value !== undefined && value !== '') {
        // 通常の文字列値
        return Array.isArray(value) ? value.join(', ') : value;
      }
      if (defaultValue !== undefined) {
        return defaultValue.trim();
      }
      // 値もデフォルトもない場合は空文字列（後で除去される）
      return '';
    }
  );
}

// 変数がすべて解決されているかチェック
export function hasUnresolvedVariables(content: string): boolean {
  return /\$\{[^}]+\}/.test(content);
}
