import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** Set VITE_DEV_HTTPS=true (or run `npm run dev:https`) to use HTTPS + self-signed cert. */
const devHttps = process.env.VITE_DEV_HTTPS === 'true';

/** Unique per Vercel deploy — used client-side to reset chunk-reload state after a new release. */
const appBuildId =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  '';

/**
 * Canonical / OG URLs in index.html default to www.dreemystar.com. On Vercel, replace with the
 * actual deployment host (VERCEL_URL) unless VITE_PUBLIC_SITE_ORIGIN is set (use that for a stable
 * production domain). Avoids OAuth/SEO mismatch when testing on *.vercel.app (e.g. dreemprod).
 */
function resolveSiteOriginForHtml(): string | null {
  const explicit = process.env.VITE_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v}`;
  return null;
}

function htmlInjectSiteOrigin() {
  const name = 'html-inject-site-origin';
  return {
    name,
    transformIndexHtml(html: string) {
      const origin = resolveSiteOriginForHtml();
      if (!origin) return html;
      const legacy = 'https://www.dreemystar.com';
      if (!html.includes(legacy)) return html;
      return html.split(legacy).join(origin);
    },
  };
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(appBuildId),
  },
  plugins: [
    react(),
    htmlInjectSiteOrigin(),
    ...(devHttps ? [basicSsl()] : []),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-lucide': ['lucide-react'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-agora': ['agora-rtc-sdk-ng'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          'vendor-stripe': ['@stripe/stripe-js'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/react-virtual'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: true,
    allowedHosts: [
      'e3879f6ce5d3.ngrok-free.app',
      '.ngrok-free.app',
      '.ngrok.app',
    ],
  },
});
