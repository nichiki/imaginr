'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, AlertCircle } from 'lucide-react';

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
  const [copiedMerged, setCopiedMerged] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const copyToClipboard = useCallback(async (text: string, type: 'merged' | 'prompt') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'merged') {
        setCopiedMerged(true);
        setTimeout(() => setCopiedMerged(false), 2000);
      } else {
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, []);

  return (
    <div className="h-full bg-[#252526] flex flex-col">
      <Tabs defaultValue="merged" className="flex flex-col h-full">
        <div className="px-3 py-2 flex items-center justify-between border-b border-[#333]">
          <span className="text-xs uppercase text-[#888] font-medium">
            Preview
          </span>
          <TabsList className="h-7 bg-[#3c3c3c]">
            <TabsTrigger value="merged" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Merged YAML
            </TabsTrigger>
            <TabsTrigger value="prompt" className="text-xs h-5 px-2 text-[#d4d4d4] data-[state=active]:text-white data-[state=active]:bg-[#094771]">
              Prompt Text
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="merged" className="flex-1 m-0 overflow-auto relative">
          {!isYamlValid ? (
            <div className="p-4 flex items-center gap-2 text-yellow-500 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>YAML parse error - 構文を確認してください</span>
            </div>
          ) : (
            <>
              <button
                onClick={() => copyToClipboard(mergedYaml, 'merged')}
                className="absolute top-2 right-2 p-1.5 rounded bg-[#3c3c3c] hover:bg-[#4c4c4c] text-[#888] hover:text-[#d4d4d4] transition-colors"
                title="Copy to clipboard"
              >
                {copiedMerged ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
                {mergedYaml || '(YAMLを入力してください)'}
              </pre>
            </>
          )}
        </TabsContent>
        <TabsContent value="prompt" className="flex-1 m-0 overflow-auto relative">
          <button
            onClick={() => copyToClipboard(promptText, 'prompt')}
            className="absolute top-2 right-2 p-1.5 rounded bg-[#3c3c3c] hover:bg-[#4c4c4c] text-[#888] hover:text-[#d4d4d4] transition-colors"
            title="Copy to clipboard"
          >
            {copiedPrompt ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <pre className="p-3 text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap">
            {promptText || '(プロンプトテキストがここに表示されます)'}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
