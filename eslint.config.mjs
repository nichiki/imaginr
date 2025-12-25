import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tauri build artifacts:
    "src-tauri/target/**",
  ]),
  // Tauri + Next.js specific rule overrides
  {
    rules: {
      // Tauri環境ではNext.jsのサーバーサイド画像最適化が使えないため、
      // <img>要素の使用を許可する
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
