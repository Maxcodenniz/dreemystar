import type { AuthError } from '@supabase/supabase-js';

/** Supabase GoTrue duplicate-signup / existing-user messages vary by version and locale. */
export function isDuplicateEmailSignUpError(err: AuthError | Error): boolean {
  const m = (err.message || '').toLowerCase();
  if (m.includes('user already registered')) return true;
  if (m.includes('already been registered')) return true;
  if (m.includes('email') && m.includes('already')) return true;
  if (m.includes('signup is disabled')) return false;
  return false;
}

type PostgrestLikeError = { code?: string; message?: string };

/** Duplicate primary key on profiles — row already exists (retry, race, or prior insert). */
export function isDuplicateProfileIdError(err: PostgrestLikeError): boolean {
  if (err.code !== '23505') return false;
  const m = (err.message || '').toLowerCase();
  return m.includes('profiles_pkey') || (m.includes('key (id)') && m.includes('profiles'));
}

export function isDuplicateUsernameConstraintError(err: PostgrestLikeError): boolean {
  if (err.code !== '23505') return false;
  const m = (err.message || '').toLowerCase();
  return m.includes('username') || m.includes('profiles_username');
}
