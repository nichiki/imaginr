// 変数ユーティリティ

export interface VariableDefinition {
  name: string;
  defaultValue?: string;
}

export interface VariableValues {
  [name: string]: string;
}

// YAMLコンテンツから変数を抽出
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

// 変数を値で置換
export function resolveVariables(
  content: string,
  values: VariableValues
): string {
  return content.replace(
    /\$\{([^}|]+)(?:\|([^}]*))?\}/g,
    (match, name, defaultValue) => {
      const varName = name.trim();
      const value = values[varName];
      if (value !== undefined && value !== '') {
        return value;
      }
      if (defaultValue !== undefined) {
        return defaultValue.trim();
      }
      // 値もデフォルトもない場合はそのまま残す
      return match;
    }
  );
}

// 変数がすべて解決されているかチェック
export function hasUnresolvedVariables(content: string): boolean {
  return /\$\{[^}]+\}/.test(content);
}
