import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_KEY = 'vite_chunk_reload_attempted';
const BUILD_STORAGE_KEY = 'dreemystar_app_build_id';

/**
 * When a new deploy loads (new main bundle with new VITE_BUILD_ID), reset the
 * one-shot chunk reload flag so users can recover again after a release.
 */
export function syncBuildIdAndClearChunkRecovery(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const id = import.meta.env.VITE_BUILD_ID || '';
    if (!id) return;
    const prev = sessionStorage.getItem(BUILD_STORAGE_KEY);
    if (prev !== id) {
      sessionStorage.setItem(BUILD_STORAGE_KEY, id);
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }
  } catch {
    /* private mode */
  }
}

function tryChunkRecoveryReload(): boolean {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

let globalChunkRecoveryRegistered = false;

/**
 * Catches failed dynamic imports that are NOT wrapped in React.lazy (nested
 * chunks, e.g. old lucide splits, Stripe loadStripe, etc.) and applies the same
 * one-shot reload as route-level lazyWithRetry.
 */
export function registerGlobalChunkImportRecovery(): void {
  if (typeof window === 'undefined' || globalChunkRecoveryRegistered) return;
  globalChunkRecoveryRegistered = true;

  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    if (tryChunkRecoveryReload()) {
      event.preventDefault();
    }
  });
}

export function isChunkLoadError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ChunkLoadError') {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|ChunkLoadError|Importing a module script failed|dynamic import.*timed out|Import timed out/i.test(
    msg
  );
}

const IMPORT_TIMEOUT_MS = 45_000;

function importWithTimeout<T>(factory: () => Promise<{ default: T }>): Promise<{ default: T }> {
  return Promise.race([
    factory(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'dynamic import timed out — network may be stalled or assets are stale after a deploy'
            )
          ),
        IMPORT_TIMEOUT_MS
      )
    ),
  ]);
}

/**
 * React.lazy wrapper that retries failed dynamic imports (flaky network) and,
 * on stale chunk errors after deploy, reloads the page once so the browser
 * picks up new hashed asset URLs.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await importWithTimeout(factory);
      } catch (err) {
        const chunk = isChunkLoadError(err);

        if (chunk && attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }

        if (chunk && tryChunkRecoveryReload()) {
          return new Promise(() => {
            /* never resolves — page reloads */
          }) as Promise<{ default: T }>;
        }

        throw err;
      }
    }

    throw new Error('lazyWithRetry: exhausted retries');
  });
}
