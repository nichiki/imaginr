'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreviewPanelProps {
  mergedYaml: string;
  promptText: string;
  lookName?: string;
  isYamlValid?: boolean;
}

export function PreviewPanel({
  mergedYaml,
  promptText,
  isYamlValid = true,
}: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'merged' | 'prompt'>('merged');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async () => {
    const text = activeTab === 'merged' ? mergedYaml : promptText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [activeTab, mergedYaml, promptText]);

  const canCopy = activeTab === 'merged' ? (isYamlValid && !!mergedYaml) : !!promptText;

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'merged' | 'prompt')} className="flex flex-col h-full">
        <div className="h-11 px-3 flex items-center justify-between border-b border-[#333] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase text-[#888] font-medium">
              Preview
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[#d4d4d4] hover:text-white hover:bg-[#094771] disabled:opacity-50"
              onClick={copyToClipboard}
              disabled={!canCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                  <span className="text-xs">コピーしました</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-xs">コピー</span>
                </>
              )}
            </Button>
          </div>
          <TabsList className="h-7 bg-[#3c3c3c]">
            <TabsTrigger value="merged" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Merged YAML
            </TabsTrigger>
            <TabsTrigger value="prompt" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Prompt Text
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="merged" className="flex-1 m-0 overflow-auto">
          {!isYamlValid ? (
            <div className="p-4 flex items-center gap-2 text-yellow-500 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>YAML parse error - 構文を確認してください</span>
            </div>
          ) : (
            <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
              {mergedYaml || '(YAMLを入力してください)'}
            </pre>
          )}
        </TabsContent>
        <TabsContent value="prompt" className="flex-1 m-0 overflow-auto">
          <div className="px-3 py-2 text-xs text-[#888] bg-[#2d2d2d] border-b border-[#333]">
            未実装。LLMによるエンハンサーを導入予定。
          </div>
          <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
            {promptText || '(プロンプトテキストがここに表示されます)'}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
