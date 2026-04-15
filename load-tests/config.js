/**
 * Shared configuration for all load tests.
 * Fill in SUPABASE_URL and SUPABASE_ANON_KEY before running.
 *
 * You can also set them via environment variables:
 *   K6_SUPABASE_URL=https://xxx.supabase.co K6_SUPABASE_ANON_KEY=eyJ... k6 run test.js
 */

export const SUPABASE_URL   = __ENV.K6_SUPABASE_URL   || 'https://ckkpbsstympysqagslju.supabase.co';
export const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra3Bic3N0eW1weXNxYWdzbGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1NzAyNTcsImV4cCI6MjA2MzE0NjI1N30.ijKf5SbVnM-a-wlLokXbx4vW14x4pNRh3ovvvgqF6xg';

// A real events.id UUID from your database (no "event_" prefix — Agora channel is event_${UUID})
export const TEST_EVENT_ID  = __ENV.K6_TEST_EVENT_ID  || '7e58aaa2-fb06-4273-afeb-8224d0fc42e9';

// A real user JWT (for authenticated endpoint tests). Get this from the browser dev tools.
export const TEST_USER_JWT  = __ENV.K6_TEST_USER_JWT  || '';

export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;

export const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

export function authHeaders(jwt) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${jwt || SUPABASE_ANON_KEY}`,
  };
}
