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
import { useState, useEffect } from 'react';

syncBuildIdAndClearChunkRecovery();
registerGlobalChunkImportRecovery();

// Console override disabled – in-app log console removed.
// To re-enable for debugging: set ?console=true or localStorage mobileConsoleEnabled=true
// and render <MobileConsole /> in App.tsx

const AppWithLoading = () => {
  const [showLoading, setShowLoading] = useState(true);
  const [appInitialized, setAppInitialized] = useState(false);

  // Keep Zustand in sync with Supabase (OAuth PKCE, refresh, sign-out)
  useEffect(() => {
    const { unsubscribe } = subscribeAuthToStore();
    return unsubscribe;
  }, []);

  // Initialize auth state
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const initializeAuth = async () => {
      try {
        // Check if this is an email confirmation redirect
        // If so, let SignInForm handle it - don't block here
        const hasHashFragment = window.location.hash.includes('access_token') || window.location.hash.includes('type=signup');
        const urlParams = new URLSearchParams(window.location.search);
        const isEmailConfirmation = hasHashFragment || urlParams.get('confirmed') === 'true';
        
        // For email confirmation, skip blocking auth check - let SignInForm handle it
        if (isEmailConfirmation) {
          console.log('Email confirmation detected - letting SignInForm handle it');
          useStore.getState().setInitialized(true);
          setAppInitialized(true);
          return;
        }
        
        // Failsafe: never block the shell on hung Supabase (slow getSession is OK below)
        timeoutId = setTimeout(() => {
          if (import.meta.env.DEV) {
            console.warn('Auth initialization timeout - proceeding anyway');
          }
          useStore.getState().setInitialized(true);
          setAppInitialized(true);
        }, 12000);

        const { data: { session } } = await supabase.auth.getSession();
        const store = useStore.getState();

        if (session?.user) {
          store.setUser(session.user);
        }

        // Unblock UI immediately after session — do not await profiles (deployed
        // sites were stuck on "Initializing…" when /profiles was slow or hung).
        store.setInitialized(true);
        clearTimeout(timeoutId);
        setAppInitialized(true);

        if (session?.user) {
          void (async () => {
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();
              if (profile) {
                useStore.getState().setUserProfile(profile);
              }
            } catch {
              // Profile may load later via authSync or page code
            }
          })();
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        useStore.getState().setInitialized(true);
        if (timeoutId) clearTimeout(timeoutId);
        setAppInitialized(true);
      }
    };

    initializeAuth();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleLoadingComplete = () => {
    setShowLoading(false);
  };

  // Add a maximum loading time to prevent infinite loading
  useEffect(() => {
    const maxLoadingTimer = setTimeout(() => {
      if (import.meta.env.DEV) {
        console.warn('Maximum loading time reached - forcing app to render');
      }
      setShowLoading(false);
      if (!appInitialized) {
        useStore.getState().setInitialized(true);
        setAppInitialized(true);
      }
    }, 10000); // 10 seconds maximum

    return () => clearTimeout(maxLoadingTimer);
  }, []);

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
