'use client';

import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { initializeMonaco } from '@/lib/monaco-config';

export function Providers({ children }: { children: React.ReactNode }) {
  const [monacoReady, setMonacoReady] = useState(false);

  useEffect(() => {
    // Initialize Monaco with current language
    // Language changes are handled by page reload in settings dialog
    const locale = i18n.language === 'ja' ? 'ja' : 'en';
    initializeMonaco(locale).then(() => {
      setMonacoReady(true);
    });
  }, []);

  // Don't render children until Monaco is initialized
  if (!monacoReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1e1e1e] text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
