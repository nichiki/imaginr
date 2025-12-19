// ComfyUI API Client

export interface GenerationProgress {
  status: 'connecting' | 'queued' | 'generating' | 'completed' | 'error';
  progress?: number;  // 0-100
  currentNode?: string;
  error?: string;
}

export interface GenerationResult {
  success: boolean;
  images: string[];  // Base64 or URLs
  error?: string;
}

type ProgressCallback = (progress: GenerationProgress) => void;

export class ComfyUIClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private clientId: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');  // Remove trailing slash
    this.clientId = `ipb-${Date.now()}`;
  }

  // ワークフローJSONにプロンプトを埋め込んで生成をキュー
  async generate(
    workflow: Record<string, unknown>,
    prompt: string,
    promptNodeId: string,
    onProgress?: ProgressCallback
  ): Promise<GenerationResult> {
    try {
      onProgress?.({ status: 'connecting' });

      // プロンプトをワークフローに埋め込む
      const workflowWithPrompt = this.injectPrompt(workflow, prompt, promptNodeId);

      // WebSocket接続
      const promptId = await this.queuePrompt(workflowWithPrompt, onProgress);

      // 結果を取得
      const images = await this.waitForCompletion(promptId, onProgress);

      onProgress?.({ status: 'completed', progress: 100 });
      return { success: true, images };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ status: 'error', error: errorMessage });
      return { success: false, images: [], error: errorMessage };
    } finally {
      this.disconnect();
    }
  }

  private injectPrompt(
    workflow: Record<string, unknown>,
    prompt: string,
    nodeId: string
  ): Record<string, unknown> {
    const copy = JSON.parse(JSON.stringify(workflow));

    if (copy[nodeId] && typeof copy[nodeId] === 'object') {
      const node = copy[nodeId] as Record<string, unknown>;
      if (node.inputs && typeof node.inputs === 'object') {
        (node.inputs as Record<string, unknown>).text = prompt;
      }
    }

    return copy;
  }

  private async queuePrompt(
    workflow: Record<string, unknown>,
    onProgress?: ProgressCallback
  ): Promise<string> {
    onProgress?.({ status: 'queued' });

    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to queue prompt: ${response.status}`);
    }

    const data = await response.json();
    return data.prompt_id;
  }

  private async waitForCompletion(
    promptId: string,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl.replace('http', 'ws')}/ws?clientId=${this.clientId}`;
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('Generation timed out'));
        this.disconnect();
      }, 300000);  // 5分タイムアウト

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'progress' && message.data?.prompt_id === promptId) {
            const progress = Math.round((message.data.value / message.data.max) * 100);
            onProgress?.({ status: 'generating', progress });
          }

          if (message.type === 'executing' && message.data?.prompt_id === promptId) {
            onProgress?.({
              status: 'generating',
              currentNode: message.data.node
            });
          }

          if (message.type === 'executed' && message.data?.prompt_id === promptId) {
            clearTimeout(timeout);
            const images = await this.fetchImages(promptId);
            resolve(images);
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${error}`));
      };

      this.ws.onclose = () => {
        // Connection closed
      };
    });
  }

  private async fetchImages(promptId: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/history/${promptId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch generation history');
    }

    const history = await response.json();
    const outputs = history[promptId]?.outputs;

    if (!outputs) {
      return [];
    }

    const images: string[] = [];

    for (const nodeOutput of Object.values(outputs)) {
      const nodeImages = (nodeOutput as { images?: Array<{ filename: string; subfolder: string; type: string }> }).images;
      if (nodeImages) {
        for (const img of nodeImages) {
          const imageUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
          images.push(imageUrl);
        }
      }
    }

    return images;
  }

  private disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 接続テスト
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
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }
}
