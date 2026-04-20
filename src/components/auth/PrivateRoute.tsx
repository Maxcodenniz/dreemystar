import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { supabase } from '../../lib/supabaseClient';
import { withTimeout } from '../../utils/eventsFetch';

interface PrivateRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

/** After login, `user` is set before `userProfile` hydrates. Wait before redirecting away from role routes. */
const PROFILE_WAIT_MS = 20_000;
const PROFILE_FETCH_MS = 5_000;

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, roles }) => {
  const { user, userProfile } = useStore();
  const location = useLocation();
  const [profileWaitExpired, setProfileWaitExpired] = useState(false);

  // Proactively load profile when JWT exists but Zustand hasn’t hydrated yet (slow / flaky Supabase)
  useEffect(() => {
    if (!user?.id || userProfile || !roles?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          PROFILE_FETCH_MS,
          'PrivateRoute.profileFetch'
        );
        if (!cancelled && data && !error) {
          useStore.getState().setUserProfile(data);
        }
      } catch {
        /* timeout / network; authSync / main may still populate later */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, userProfile, roles]);

  useEffect(() => {
    if (!user || !roles?.length || userProfile) {
      setProfileWaitExpired(false);
      return;
    }
    const id = window.setTimeout(() => setProfileWaitExpired(true), PROFILE_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [user, roles, userProfile]);

  if (!user) {
    if (import.meta.env.DEV) console.log('❌ No user - redirecting to login');
    // Store the current location as return URL
    const returnUrl = location.pathname + location.search;
    sessionStorage.setItem('returnUrl', returnUrl);
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0) {
    if (!userProfile) {
      if (!profileWaitExpired) {
        return (
          <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
            <p className="text-gray-400 text-sm text-center">Loading your account…</p>
          </div>
        );
      }
      if (import.meta.env.DEV) console.log('❌ No user profile after wait - redirecting to home');
      return <Navigate to="/" replace />;
    }

    if (!userProfile.user_type || !roles.includes(userProfile.user_type)) {
      if (import.meta.env.DEV) {
        console.log('❌ Insufficient permissions:', {
          userType: userProfile.user_type,
          requiredRoles: roles
        });
      }
      return <Navigate to="/" replace />;
    }
  }

  if (import.meta.env.DEV) console.log('✅ Access granted');
  return <>{children}</>;
};

export default PrivateRoute;