// ComfyUI API Client - Simplified polling-based approach

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

  async generate(
    workflow: Record<string, unknown>,
    prompt: string,
    promptNodeId: string,
    samplerNodeId: string,
    onProgress?: ProgressCallback
  ): Promise<GenerationResult> {
    try {
      onProgress?.({ status: 'connecting' });

      // プロンプトとシードをワークフローに埋め込む
      const preparedWorkflow = this.prepareWorkflow(workflow, prompt, promptNodeId, samplerNodeId);

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
    samplerNodeId: string
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

    return copy;
  }

  private async queuePrompt(workflow: Record<string, unknown>): Promise<string> {
    console.log('[ComfyUI] Queueing prompt...');
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ComfyUI] Queue failed:', response.status, errorText);
      throw new Error(`Failed to queue prompt: ${response.status} - ${errorText}`);
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
        const response = await fetch(`${this.baseUrl}/history/${promptId}`);
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
          console.error('[ComfyUI] Generation error:', entry.status);
          throw new Error(entry.status?.messages?.[0]?.[1] || 'Generation error');
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
      const response = await fetch(`${this.baseUrl}/system_stats`);
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
