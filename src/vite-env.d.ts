/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vercel deployment id or git SHA; set at build time in vite.config.ts */
  readonly VITE_BUILD_ID: string;
}
