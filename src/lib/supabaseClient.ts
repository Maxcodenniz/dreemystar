import { createClient } from '@supabase/supabase-js';
import { safeLocalStorage } from '../utils/safeLocalStorage';
import { SERVICE_UNAVAILABLE } from '../utils/userFacingErrors';

// Trim whitespace and newlines from environment variables (common issue when copying from Supabase dashboard)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

let supabase: any;

if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.DEV) {
    console.error('Missing backend URL or anon key in environment');
  }

  const notConfiguredError = () => new Error(SERVICE_UNAVAILABLE);
  const mockQueryResult = () =>
    Promise.resolve({ data: null, error: notConfiguredError() });

  /** Chainable thenable so `.from().select().neq().order()` matches real PostgREST builders. */
  const makeChainablePostgrestMock = (): object =>
    new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              mockQueryResult().then(onFulfilled, onRejected);
          }
          if (prop === 'catch') {
            return (onRejected: (e: unknown) => unknown) => mockQueryResult().catch(onRejected);
          }
          if (prop === 'finally') {
            return (onFinally: () => void) => mockQueryResult().finally(onFinally);
          }
          return () => makeChainablePostgrestMock();
        },
      }
    );

  // Create a mock client that will show configuration errors
  const mockClient = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: new Error(SERVICE_UNAVAILABLE) }),
      getSession: () => Promise.resolve({ data: { session: null }, error: new Error(SERVICE_UNAVAILABLE) }),
      signInWithPassword: () => Promise.resolve({ data: null, error: new Error(SERVICE_UNAVAILABLE) }),
      signUp: () => Promise.resolve({ data: null, error: new Error(SERVICE_UNAVAILABLE) }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    },
    from: () => makeChainablePostgrestMock(),
    functions: {
      invoke: () => Promise.resolve({ data: null, error: new Error(SERVICE_UNAVAILABLE) })
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ error: new Error(SERVICE_UNAVAILABLE) }),
        getPublicUrl: () => ({ data: { publicUrl: '' } })
      })
    }
  };
  
  supabase = mockClient;
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Avoid DOMException "The operation is insecure." crashing the app in WebViews / strict Safari
      storage: safeLocalStorage,
    }
  });
}

export { supabase };