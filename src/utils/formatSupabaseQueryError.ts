import { SERVICE_UNAVAILABLE } from './userFacingErrors';

/**
 * Turns Supabase/PostgREST errors into actionable copy (not longer timeouts).
 * Safe for end users — no env values or keys in the string.
 */
export function formatSupabaseQueryError(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;

  const e = err as { message?: string; code?: string; hint?: string; details?: string };
  const msg = (e.message || '').trim();
  const details = (e.details || '').trim();
  const combined = `${msg} ${details} ${e.hint || ''}`;

  // Mock client when VITE_* missing
  if (msg === SERVICE_UNAVAILABLE || /^Service unavailable$/i.test(msg)) {
    return 'Backend not configured: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart the dev server. In production, set the same variables in your host (Vite bakes them at build time).';
  }

  if (e.code === 'PGRST301' || /JWT|jwt expired|Invalid Refresh Token|JWT could not be parsed/i.test(combined)) {
    return 'Session or API key problem: refresh the page. If this persists, check VITE_SUPABASE_ANON_KEY matches Project Settings → API in Supabase.';
  }

  if (
    e.code === '42501' ||
    /permission denied|RLS|row-level security|insufficient_privilege/i.test(combined)
  ) {
    return 'Database blocked this read (RLS). Ensure public SELECT policies exist for `events` and `profiles`, or sign in if your policies require it.';
  }

  if (/invalid api key|Invalid API key|No API key/i.test(combined)) {
    return 'Invalid Supabase API key. Use the anon public key from Supabase → Project Settings → API as VITE_SUPABASE_ANON_KEY.';
  }

  if (/Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ERR_NETWORK|net::ERR/i.test(combined)) {
    return 'Browser could not reach Supabase. Check internet, ad blockers, VPN, and that VITE_SUPABASE_URL has no typo (https://xxx.supabase.co).';
  }

  if (/timed out|Timeout/i.test(combined)) {
    return 'Request timed out. The database may be slow or unreachable; confirm the project URL and region, then try again.';
  }

  const devSuffix = import.meta.env.DEV && e.code ? ` [${e.code}]` : '';
  if (msg) return msg + devSuffix;
  return 'Could not load data.' + devSuffix;
}
