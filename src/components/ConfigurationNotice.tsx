import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Shown when required env is missing at build time. Copy is intentionally generic:
 * no vendor names, env var names, or support emails in the UI.
 */
const ConfigurationNotice: React.FC = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const missingBackend = !supabaseUrl || !supabaseAnonKey;

  if (!missingBackend) return null;

  return (
    <div className="bg-amber-500/15 border border-amber-500/60 text-amber-100 px-4 py-3 rounded-lg mb-6 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-400" />
        <div>
          <p className="font-semibold text-amber-50">Service temporarily unavailable</p>
          <p className="mt-1 text-amber-100/90">
            This build cannot reach the live service. Please try again later or use a different environment.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationNotice;
