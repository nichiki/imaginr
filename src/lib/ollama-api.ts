// Ollama API Client - Tauri専用
// Direct HTTP requests using Tauri plugin (no CORS issues)

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface GenerateProgress {
  status: 'connecting' | 'generating' | 'completed' | 'error';
  content?: string;
  done?: boolean;
  error?: string;
}

export interface GenerateResult {
  success: boolean;
  content: string;
  error?: string;
}

type ProgressCallback = (progress: GenerateProgress) => void;

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await tauriFetch(`${this.baseUrl}/api/tags`, {
        headers: { Origin: 'http://localhost' },
      });
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: `HTTP ${response.status}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * インストール済みモデル一覧を取得
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await tauriFetch(`${this.baseUrl}/api/tags`, {
        headers: { Origin: 'http://localhost' },
      });
      if (!response.ok) {
        console.error('[Ollama] Failed to list models:', response.status);
        return [];
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('[Ollama] Failed to list models:', error);
      return [];
    }
  }

  /**
   * テキスト生成（ストリーミング対応）
   */
  async generate(
    prompt: string,
    model: string,
    systemPrompt?: string,
    options?: { temperature?: number },
    onProgress?: ProgressCallback
  ): Promise<GenerateResult> {
    try {
      onProgress?.({ status: 'connecting' });
      console.log('[Ollama] Starting generation with model:', model);

      const response = await tauriFetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: JSON.stringify({
          model,
          prompt,
          system: systemPrompt,
          stream: true,
          options: {
            temperature: options?.temperature ?? 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Ollama] Generation failed:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      onProgress?.({ status: 'generating' });

      // ストリーミングレスポンスを処理
      const content = await this.processStreamResponse(response, onProgress);

      onProgress?.({ status: 'completed', content, done: true });
      console.log('[Ollama] Generation completed, length:', content.length);

      return { success: true, content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Ollama] Generation error:', errorMessage);
      onProgress?.({ status: 'error', error: errorMessage });
      return { success: false, content: '', error: errorMessage };
    }
  }

  /**
   * ストリーミングレスポンスを処理
   * Ollamaは各行がJSONオブジェクト（NDJSON形式）
   */
  private async processStreamResponse(
    response: Response,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 改行で分割して各JSONオブジェクトを処理
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 最後の不完全な行はバッファに残す

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullContent += data.response;
              onProgress?.({
                status: 'generating',
                content: fullContent,
                done: data.done,
              });
            }
            if (data.done) {
              break;
            }
          } catch {
            // JSON解析エラーは無視（不完全な行の可能性）
            console.warn('[Ollama] Failed to parse line:', line);
          }
        }
      }

      // 残りのバッファを処理
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.response) {
            fullContent += data.response;
          }
        } catch {
          // 無視
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }
}
