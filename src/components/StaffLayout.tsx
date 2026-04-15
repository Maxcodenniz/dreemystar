import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { LogOut, User } from 'lucide-react';

interface StaffLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const StaffLayout: React.FC<StaffLayoutProps> = ({ children, title = 'Staff' }) => {
  const navigate = useNavigate();
  const { user, userProfile, signOut } = useStore();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const displayName = userProfile?.full_name?.trim() || userProfile?.username || user?.email || 'Admin';

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gray-900/80 gap-4">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0 max-w-[50vw] sm:max-w-none">
            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-300 text-sm truncate" title={user?.email || displayName}>
              {displayName}
            </span>
            {user?.email && user?.email !== displayName && (
              <span className="text-gray-500 text-xs truncate hidden md:inline" title={user.email}>
                ({user.email})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <div className="flex-grow p-4 md:p-6">
        {children}
      </div>
    </div>
  );
};

export default StaffLayout;
