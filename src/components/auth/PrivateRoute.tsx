import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';

interface PrivateRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

/** After login, `user` is set before `userProfile` hydrates. Wait before redirecting away from role routes. */
const PROFILE_WAIT_MS = 12_000;

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, roles }) => {
  const { user, userProfile } = useStore();
  const location = useLocation();
  const [profileWaitExpired, setProfileWaitExpired] = useState(false);

  useEffect(() => {
    if (!user || !roles?.length || userProfile) {
      setProfileWaitExpired(false);
      return;
    }
    const id = window.setTimeout(() => setProfileWaitExpired(true), PROFILE_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [user, roles, userProfile]);

  if (import.meta.env.DEV) {
    console.log('🔒 PrivateRoute check:', {
      hasUser: !!user,
      userEmail: user?.email,
      profileType: userProfile?.user_type,
      requiredRoles: roles,
      profileId: userProfile?.id
    });
  }

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