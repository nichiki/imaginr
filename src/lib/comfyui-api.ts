// ComfyUI API Client - Tauri専用
// Direct HTTP requests using Tauri plugin (no CORS issues)

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { NodeOverride } from './storage';

export interface GenerationProgress {
  status: 'connecting' | 'queued' | 'generating' | 'completed' | 'error';
  progress?: number;
  currentNode?: string;
  error?: string;
}

export interface GenerationResult {
  success: boolean;
  images: string[];
  error?: string;
}

type ProgressCallback = (progress: GenerationProgress) => void;

export class ComfyUIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // HTTPリクエスト（Tauri: 直接、CORSなし）
  private async httpGet(endpoint: string): Promise<Response> {
    return tauriFetch(`${this.baseUrl}${endpoint}`);
  }

  private async httpPost(endpoint: string, body: unknown): Promise<Response> {
    return tauriFetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async generate(
    workflow: Record<string, unknown>,
    prompt: string,
    promptNodeId: string,
    samplerNodeId: string,
    overrides: NodeOverride[] = [],
    onProgress?: ProgressCallback
  ): Promise<GenerationResult> {
    try {
      onProgress?.({ status: 'connecting' });

      // プロンプトとシードをワークフローに埋め込む
      const preparedWorkflow = this.prepareWorkflow(workflow, prompt, promptNodeId, samplerNodeId, overrides);

      // プロンプトをキュー
      onProgress?.({ status: 'queued' });
      const promptId = await this.queuePrompt(preparedWorkflow);

      // ポーリングで完了を待つ
      onProgress?.({ status: 'generating' });
      const images = await this.waitForCompletion(promptId, onProgress);

      onProgress?.({ status: 'completed', progress: 100 });
      return { success: true, images };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ status: 'error', error: errorMessage });
      return { success: false, images: [], error: errorMessage };
    }
  }

  private generateRandomSeed(): number {
    return Math.floor(Math.random() * 4294967294) + 1;
  }

  private prepareWorkflow(
    workflow: Record<string, unknown>,
    prompt: string,
    promptNodeId: string,
    samplerNodeId: string,
    overrides: NodeOverride[] = []
  ): Record<string, unknown> {
    const copy = JSON.parse(JSON.stringify(workflow));

    // プロンプトを注入
    if (promptNodeId && copy[promptNodeId] && typeof copy[promptNodeId] === 'object') {
      const node = copy[promptNodeId] as Record<string, unknown>;
      if (node.inputs && typeof node.inputs === 'object') {
        (node.inputs as Record<string, unknown>).text = prompt;
      }
    }

    // サンプラーノードのシードをランダム化
    if (samplerNodeId && copy[samplerNodeId] && typeof copy[samplerNodeId] === 'object') {
      const node = copy[samplerNodeId] as Record<string, unknown>;
      if (node.inputs && typeof node.inputs === 'object') {
        (node.inputs as Record<string, unknown>).seed = this.generateRandomSeed();
      }
    }

    // overridesを適用
    for (const override of overrides) {
      if (!override.nodeId || !override.property) continue;

      const node = copy[override.nodeId];
      if (!node || typeof node !== 'object') continue;

      const nodeObj = node as Record<string, unknown>;

      // プロパティがドット記法の場合（例: "inputs.width"）
      if (override.property.includes('.')) {
        const parts = override.property.split('.');
        let target: Record<string, unknown> = nodeObj;
        for (let i = 0; i < parts.length - 1; i++) {
          if (target[parts[i]] && typeof target[parts[i]] === 'object') {
            target = target[parts[i]] as Record<string, unknown>;
          } else {
            break;
          }
        }
        target[parts[parts.length - 1]] = override.value;
      } else {
        // 直接プロパティの場合、inputsの下に設定
        if (nodeObj.inputs && typeof nodeObj.inputs === 'object') {
          (nodeObj.inputs as Record<string, unknown>)[override.property] = override.value;
        }
      }
    }

    return copy;
  }

  private async queuePrompt(workflow: Record<string, unknown>): Promise<string> {
    console.log('[ComfyUI] Queueing prompt...');
    const response = await this.httpPost('/prompt', { prompt: workflow });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[ComfyUI] Queue failed:', response.status, errorData);
      throw new Error(`Failed to queue prompt: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('[ComfyUI] Prompt queued, ID:', data.prompt_id);
    return data.prompt_id;
  }

  private async waitForCompletion(
    promptId: string,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    const startTime = Date.now();
    const timeout = 300000; // 5分
    const pollInterval = 1000; // 1秒
    let pollCount = 0;

    console.log('[ComfyUI] Waiting for completion...');

    while (Date.now() - startTime < timeout) {
      try {
        pollCount++;
        const response = await this.httpGet(`/history/${promptId}`);
        if (!response.ok) {
          console.log(`[ComfyUI] Poll ${pollCount}: History not ready (${response.status})`);
          await this.sleep(pollInterval);
          continue;
        }

        const history = await response.json();
        const entry = history[promptId];

        if (!entry) {
          console.log(`[ComfyUI] Poll ${pollCount}: No entry yet`);
          await this.sleep(pollInterval);
          continue;
        }

        // エラーチェック
        if (entry.status?.status_str === 'error') {
          console.error('[ComfyUI] Generation error:', JSON.stringify(entry.status, null, 2));
          console.error('[ComfyUI] Full entry:', JSON.stringify(entry, null, 2));
          const errorMsg = entry.status?.messages?.[0]?.[1]?.message ||
                          entry.status?.messages?.[0]?.[1] ||
                          'Generation error';
          throw new Error(errorMsg);
        }

        // 出力をチェック
        const outputs = entry.outputs;
        if (outputs && Object.keys(outputs).length > 0) {
          console.log(`[ComfyUI] Poll ${pollCount}: Found outputs`, Object.keys(outputs));
          // 画像を探す
          const images = this.extractImages(outputs);
          if (images.length > 0) {
            console.log(`[ComfyUI] Found ${images.length} images:`, images);
            return images;
          } else {
            console.log(`[ComfyUI] Poll ${pollCount}: Outputs found but no images yet`);
          }
        } else {
          console.log(`[ComfyUI] Poll ${pollCount}: No outputs yet`);
        }

        // 進捗を更新（完了していない場合）
        onProgress?.({ status: 'generating' });
      } catch (error) {
        // ネットワークエラーは無視して継続
        if (error instanceof Error && error.message.includes('Generation error')) {
          throw error;
        }
        console.warn(`[ComfyUI] Poll ${pollCount} error:`, error);
      }

      await this.sleep(pollInterval);
    }

    console.error('[ComfyUI] Timeout after', pollCount, 'polls');
    throw new Error('Generation timed out');
  }

  private extractImages(outputs: Record<string, unknown>): string[] {
    const images: string[] = [];

    for (const nodeOutput of Object.values(outputs)) {
      const nodeImages = (nodeOutput as { images?: Array<{ filename: string; subfolder: string; type: string }> }).images;
      if (nodeImages && Array.isArray(nodeImages)) {
        for (const img of nodeImages) {
          if (img.filename) {
            // ComfyUIの直接URLを返す（画像保存時にサーバーサイドでフェッチされる）
            const imageUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
            images.push(imageUrl);
          }
        }
      }
    }

    return images;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.httpGet('/system_stats');
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
}
