import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { devLogBackendFailure } from './devBackendLog';
import { withTimeout } from './eventsFetch';

const PROFILE_LOAD_MS = 5_000;

/**
 * Subscribes to Supabase auth for the app lifetime so the Zustand store stays
 * in sync after OAuth (PKCE exchange), token refresh, and sign-out — not only
 * on initial getSession() or inside SignInForm.
 */
export function subscribeAuthToStore(): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    const store = useStore.getState();

    if (event === 'SIGNED_OUT') {
      store.setUser(null);
      store.setUserProfile(null);
      return;
    }

    if (!session?.user) {
      return;
    }

    store.setUser(session.user);

    try {
      const { data: profile } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        PROFILE_LOAD_MS,
        'authSync.profile'
      );

      if (profile) {
        store.setUserProfile(profile);
      }
    } catch (e) {
      devLogBackendFailure('authSync.onAuthStateChange.profile', e, { userId: session.user.id });
    }
  });

  return {
    unsubscribe: () => {
      try {
        data?.subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
    },
  };
}
