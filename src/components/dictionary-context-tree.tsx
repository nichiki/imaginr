'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, Key } from 'lucide-react';
import type { DictionaryTreeNode } from '@/lib/dictionary-db-api';

interface DictionaryContextTreeProps {
  nodes: DictionaryTreeNode[];
  selectedContext: string | null;
  selectedKey: string | null;
  onSelectKey: (context: string, key: string) => void;
}

export function DictionaryContextTree({
  nodes,
  selectedContext,
  selectedKey,
  onSelectKey,
}: DictionaryContextTreeProps) {
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(
    () => new Set(nodes.map((n) => n.context))
  );

  const toggleContext = useCallback((context: string) => {
    setExpandedContexts((prev) => {
      const next = new Set(prev);
      if (next.has(context)) {
        next.delete(context);
      } else {
        next.add(context);
      }
      return next;
    });
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-[#888] text-sm">
        辞書が空です
      </div>
    );
  }

  return (
    <div className="py-1">
      {nodes.map((node) => {
        const isExpanded = expandedContexts.has(node.context);
        return (
          <div key={node.context}>
            {/* Context header */}
            <button
              onClick={() => toggleContext(node.context)}
              className="w-full flex items-center gap-1 px-2 py-1 text-sm text-[#cccccc] hover:bg-[#2a2d2e] text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-[#888] flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#888] flex-shrink-0" />
              )}
              <Folder className="h-4 w-4 text-[#dcb67a] flex-shrink-0" />
              <span className="truncate">{node.context}</span>
              <span className="text-xs text-[#888] ml-auto flex-shrink-0">
                {node.keys.length}
              </span>
            </button>

            {/* Keys under this context */}
            {isExpanded && (
              <div className="ml-2">
                {node.keys.map((key) => {
                  const isSelected =
                    selectedContext === node.context && selectedKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => onSelectKey(node.context, key)}
                      className={`w-full flex items-center gap-1 px-2 py-1 text-sm text-left ${
                        isSelected
                          ? 'bg-[#094771] text-white'
                          : 'text-[#cccccc] hover:bg-[#2a2d2e]'
                      }`}
                    >
                      <span className="w-4 flex-shrink-0" />
                      <Key className="h-3.5 w-3.5 text-[#75beff] flex-shrink-0" />
                      <span className="truncate">{key}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
