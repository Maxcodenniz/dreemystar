/**
 * Target length for *local-only* UX: minimum spinner time, splash pacing, backoff between retries.
 *
 * Do **not** use this as a timeout for Supabase, auth `getSession`, or lazy chunk loads — those
 * routinely exceed 200ms on real networks; see `eventsFetch.ts`, `main.tsx`, `lazyWithRetry.ts`.
 */
export const UX_DELAY_MS = 200;
