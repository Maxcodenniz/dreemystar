import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import App from './App.tsx';
import LoadingScreen from './components/LoadingScreen.tsx';
import './suppressI18nSponsor';
import './i18n';
import './index.css';
import { supabase } from './lib/supabaseClient';
import { useStore } from './store/useStore';
import { subscribeAuthToStore } from './utils/authSync';
import { registerGlobalChunkImportRecovery, syncBuildIdAndClearChunkRecovery } from './utils/lazyWithRetry';
import { devLogBackendFailure } from './utils/devBackendLog';
import { withTimeout } from './utils/eventsFetch';
import { useState, useEffect, useCallback } from 'react';

syncBuildIdAndClearChunkRecovery();
registerGlobalChunkImportRecovery();

/** Dedupe concurrent getSession (React 18 Strict Mode runs effects twice in DEV). */
let getSessionInflight: ReturnType<typeof supabase.auth.getSession> | null = null;
function getSessionDeduplicated() {
  if (!getSessionInflight) {
    getSessionInflight = supabase.auth.getSession().finally(() => {
      getSessionInflight = null;
    });
  }
  return getSessionInflight;
}

const BOOTSTRAP_FAILSAFE_MS = 18_000;
const PROFILE_HYDRATE_MS = 5_000;

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

const AppWithLoading = () => {
  const [showLoading, setShowLoading] = useState(true);
  const [appInitialized, setAppInitialized] = useState(false);

  // Keep Zustand in sync with Supabase (OAuth PKCE, refresh, sign-out)
  useEffect(() => {
    const { unsubscribe } = subscribeAuthToStore();
    return unsubscribe;
  }, []);

  // Initialize auth state (getSession deduped for Strict Mode double-invoke in DEV)
  useEffect(() => {
    let failSafeTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const initializeAuth = async () => {
      try {
        const hasHashFragment = window.location.hash.includes('access_token') || window.location.hash.includes('type=signup');
        const urlParams = new URLSearchParams(window.location.search);
        const isEmailConfirmation = hasHashFragment || urlParams.get('confirmed') === 'true';

        if (isEmailConfirmation) {
          if (import.meta.env.DEV) {
            console.log('Email confirmation detected - letting SignInForm handle it');
          }
          useStore.getState().setInitialized(true);
          setAppInitialized(true);
          setShowLoading(false);
          return;
        }

        const sessionPromise = getSessionDeduplicated().finally(() => {
          if (failSafeTimer !== undefined) {
            clearTimeout(failSafeTimer);
            failSafeTimer = undefined;
          }
        });

        const failSafeSession = new Promise<GetSessionResult>((resolve) => {
          failSafeTimer = setTimeout(() => {
            failSafeTimer = undefined;
            if (cancelled) return;
            devLogBackendFailure(
              'main.authBootstrapTimeout',
              new Error(`getSession() did not finish within ${BOOTSTRAP_FAILSAFE_MS / 1000}s`),
              { hint: 'Often: missing/wrong VITE_* env, slow network to Supabase, or stub client.' }
            );
            resolve({ data: { session: null }, error: null });
          }, BOOTSTRAP_FAILSAFE_MS);
        });

        const raceResult = await Promise.race([sessionPromise, failSafeSession]);
        if (cancelled) return;

        const session = raceResult?.data?.session ?? null;

        const store = useStore.getState();
        if (session?.user) {
          store.setUser(session.user);
        }
        store.setInitialized(true);
        setAppInitialized(true);
        setShowLoading(false);

        if (session?.user) {
          void (async () => {
            try {
              const { data: profile } = await withTimeout(
                supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', session.user.id)
                  .maybeSingle(),
                PROFILE_HYDRATE_MS,
                'main.hydrateProfileAfterSession'
              );
              if (profile && !cancelled) {
                useStore.getState().setUserProfile(profile);
              }
            } catch (e) {
              devLogBackendFailure('main.hydrateProfileAfterSession', e, { userId: session.user.id });
            }
          })();
        }
      } catch (error) {
        devLogBackendFailure('main.initializeAuth', error);
        if (!cancelled) {
          useStore.getState().setInitialized(true);
          setAppInitialized(true);
          setShowLoading(false);
        }
      }
    };

    void initializeAuth();

    return () => {
      cancelled = true;
      if (failSafeTimer !== undefined) {
        clearTimeout(failSafeTimer);
      }
    };
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setShowLoading(false);
  }, []);

  // End loading animation if auth finished first (avoids waiting on animation while shell is ready)
  useEffect(() => {
    if (appInitialized) {
      setShowLoading(false);
    }
  }, [appInitialized]);

  // Show loading screen until both auth is initialized and loading animation completes
  if (showLoading || !appInitialized) {
    return <LoadingScreen onLoadingComplete={handleLoadingComplete} />;
  }

  return <App />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppWithLoading />
    </QueryClientProvider>
  </StrictMode>
);
