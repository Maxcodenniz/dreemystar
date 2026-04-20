/**
 * Structured DEV-only logs for Supabase / API failures (safe: no secrets, no full keys).
 * Production builds strip meaningful use if import.meta.env.DEV is false.
 */
export function devLogBackendFailure(
  context: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) return;

  const serialized = serializeUnknownError(err);
  const line = {
    where: context,
    ...serialized,
    ...extra,
  };

  console.warn('[dev:backend]', line);

  // Full object for expanding in DevTools (may include PostgREST fields)
  if (err != null && typeof err === 'object' && !(err instanceof Error)) {
    console.warn('[dev:backend] raw error object:', err);
  }
}

function serializeUnknownError(err: unknown): Record<string, unknown> {
  if (err == null) return { kind: 'null' };
  if (typeof err === 'string') return { kind: 'string', message: err };
  if (typeof err !== 'object') return { kind: typeof err, value: err };

  if (err instanceof Error) {
    return {
      kind: 'Error',
      name: err.name,
      message: err.message,
      // stack is verbose but useful for thrown JS errors
      stack: err.stack?.split('\n').slice(0, 6).join('\n'),
    };
  }

  const o = err as Record<string, unknown>;
  const out: Record<string, unknown> = {
    kind: 'object',
    message: o.message,
    code: o.code,
    details: o.details,
    hint: o.hint,
  };
  // PostgREST / Supabase sometimes use statusCode
  if (o.statusCode != null) out.statusCode = o.statusCode;
  if (o.status != null) out.status = o.status;
  return out;
}

let loggedMissingEnv = false;

/** Log once in DEV when Vite env is missing (stub client). */
export function devLogSupabaseNotConfiguredOnce(): void {
  if (!import.meta.env.DEV || loggedMissingEnv) return;
  loggedMissingEnv = true;
  console.warn('[dev:backend]', {
    where: 'supabaseClient',
    reason: 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing',
    hint: 'Add both to .env and restart `npm run dev`. Vite bakes VITE_* at startup.',
    hasUrl: Boolean(import.meta.env.VITE_SUPABASE_URL?.trim()),
    hasAnonKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()),
  });
}
