import { devLogBackendFailure } from './devBackendLog';
import { UX_DELAY_MS } from './uxDelayMs';

const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, artist_type, genres';

/** Max time for the `events` table query — failures here need fixing (env, RLS, network), not only more ms. */
const EVENTS_QUERY_MS = 10_000;

/** Max time for the batched `profiles` query — must not block listing events. */
const PROFILES_QUERY_MS = 5_000;

/** Last-resort: only `events` rows (same query as primary; avoids double penalty from profiles). */
const EVENTS_ONLY_FALLBACK_MS = 12_000;

/**
 * Retry the merged pipeline (not the emergency path).
 * Dev / slow networks: helps transient blips.
 */
export const DEFAULT_EVENTS_MAX_ATTEMPTS = 2;

async function runEventsQuery(client: any): Promise<any[]> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .neq('status', 'ended')
    .order('start_time', { ascending: true });
  if (error) {
    devLogBackendFailure('eventsFetch.runEventsQuery', error);
    throw error;
  }
  return data || [];
}

async function runProfilesBatch(client: any, ids: string[]) {
  const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).in('id', ids);
  return { data, error };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * Two requests with separate timeouts — a slow profiles batch cannot fail the whole home page.
 * If the profiles batch fails or times out, events still return with `profiles: null` (UI has fallbacks).
 */
export async function fetchEventsMerged(client: any): Promise<any[]> {
  const rows = await withTimeout(runEventsQuery(client), EVENTS_QUERY_MS, 'Events list');
  const list = rows || [];
  const ids = [...new Set(list.map((r: any) => r.artist_id).filter(Boolean))] as string[];
  if (ids.length === 0) {
    return list.map((e: any) => ({ ...e, profiles: null }));
  }

  try {
    const profRes = await withTimeout(runProfilesBatch(client, ids), PROFILES_QUERY_MS, 'Profiles batch');
    const { data: profs, error: e2 } = profRes;
    if (e2) {
      console.warn('[eventsFetch] profiles batch error; continuing without artist details', e2);
      return list.map((e: any) => ({ ...e, profiles: null }));
    }
    const map: Record<string, any> = {};
    (profs || []).forEach((p: any) => {
      map[p.id] = p;
    });
    return list.map((e: any) => ({
      ...e,
      profiles: e.artist_id ? map[e.artist_id] ?? null : null,
    }));
  } catch (e) {
    console.warn('[eventsFetch] profiles batch timed out or failed; continuing without artist details', e);
    return list.map((e: any) => ({ ...e, profiles: null }));
  }
}

/** Single query to `events` only — used when merged pipeline fails completely. */
export async function fetchEventsRowsOnlyFallback(client: any): Promise<any[]> {
  const rows = await withTimeout(runEventsQuery(client), EVENTS_ONLY_FALLBACK_MS, 'Events only');
  return (rows || []).map((e: any) => ({ ...e, profiles: null }));
}

export async function fetchEventsMergedWithRetry(
  client: any,
  options?: { maxAttempts?: number }
): Promise<any[]> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_EVENTS_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetchEventsMerged(client);
    } catch (err) {
      lastError = err;
      devLogBackendFailure('eventsFetch.fetchEventsMergedWithRetry.attempt', err, {
        attempt: attempt + 1,
        maxAttempts,
      });
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /timed out|Events list|Failed to fetch|NetworkError|Load failed/i.test(msg);
      if (attempt < maxAttempts - 1 && retryable) {
        await new Promise((r) => setTimeout(r, UX_DELAY_MS));
        continue;
      }
      break;
    }
  }

  try {
    if (import.meta.env.DEV) {
      console.warn('[eventsFetch] merged pipeline failed; trying events-only fallback', lastError);
    }
    return await fetchEventsRowsOnlyFallback(client);
  } catch (fallbackErr) {
    devLogBackendFailure('eventsFetch.fetchEventsRowsOnlyFallback', fallbackErr, {
      previousError: lastError,
    });
    throw lastError ?? fallbackErr;
  }
}
