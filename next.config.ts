import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Tauri production build only (not dev mode)
  // API routes are not used in production - all functionality uses Tauri APIs
  output: process.env.TAURI_ENV_PLATFORM && process.env.NODE_ENV === 'production' ? 'export' : undefined,

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
