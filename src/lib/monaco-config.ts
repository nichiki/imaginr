'use client';

import { loader } from '@monaco-editor/react';

// Configure Monaco Editor to use local package instead of CDN
// This is necessary for:
// 1. Offline support (Tauri desktop app)
// 2. Japanese localization support

let initialized = false;

export async function initializeMonaco(locale: 'en' | 'ja' = 'en'): Promise<void> {
  // Skip if already initialized (language changes require page reload)
  if (initialized) return;

  // Import locale file FIRST before loading monaco
  // The locale file sets globalThis._VSCODE_NLS_MESSAGES
  if (locale === 'ja') {
    await import('monaco-editor/esm/nls.messages.ja.js');
  }

  // Then import monaco with the locale already set
  const monaco = await import('monaco-editor');
  loader.config({ monaco });

  initialized = true;
}
