import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { loadLanguage } from '../storage';
import en from './locales/en.json';
import ja from './locales/ja.json';

export const resources = {
  en: { translation: en },
  ja: { translation: ja },
} as const;

export type Language = keyof typeof resources;

export const languages: { code: Language; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
];

// Initialize i18n with saved language from unified settings
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: loadLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;

// Helper to change language
export function changeLanguage(lng: Language): void {
  i18n.changeLanguage(lng);
}

// Get current language
export function getCurrentLanguage(): Language {
  return i18n.language as Language;
}
