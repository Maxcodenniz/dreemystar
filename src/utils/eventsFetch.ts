const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, artist_type, genres';

/**
 * Hard cap for the combined events+profiles fetch. This does **not** fix slow Supabase —
 * it only avoids an infinite spinner. Healthy loads should complete in a few seconds.
 * If you routinely hit this, fix the cause (RLS/indexes/project region/env), do not raise this number.
 */
export const DEFAULT_EVENTS_FETCH_MS = 15_000;

/** Second attempt only helps rare transient blips; default is one try to avoid doubling a bad latency. */
export const DEFAULT_EVENTS_MAX_ATTEMPTS = 1;

/**
 * Two requests instead of one embedded select — often faster when RLS on nested `profiles` is heavy.
 * If the profiles batch fails, we still return events with `artist_id` so the UI can render.
 */
export async function fetchEventsMerged(client: any): Promise<any[]> {
  const { data: rows, error: e1 } = await client
    .from('events')
    .select('*')
    .neq('status', 'ended')
    .order('start_time', { ascending: true });
  if (e1) throw e1;
  const list = rows || [];
  const ids = [...new Set(list.map((r: any) => r.artist_id).filter(Boolean))] as string[];
  if (ids.length === 0) {
    return list.map((e: any) => ({ ...e, profiles: null }));
  }
  const { data: profs, error: e2 } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', ids);
  if (e2) {
    console.warn('[eventsFetch] profiles batch failed; continuing without artist details', e2);
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
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

export async function fetchEventsMergedWithRetry(
  client: any,
  options?: { timeoutMs?: number; maxAttempts?: number }
): Promise<any[]> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_EVENTS_FETCH_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_EVENTS_MAX_ATTEMPTS;
  let data: any[] | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      data = await withTimeout(
        fetchEventsMerged(client),
        timeoutMs,
        'Events request'
      );
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('timed out');
      if (attempt < maxAttempts - 1 && isTimeout) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  return data ?? [];
}
