import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabaseClient';
import { FileSignature, Loader2, AlertCircle } from 'lucide-react';

const ArtistSignContract: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();
  const inviteToken = searchParams.get('invite') || '';

  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [app, setApp] = useState<{
    id: string;
    first_name: string;
    stage_name: string;
    status: string;
    contract_signed_at: string | null;
  } | null>(null);

  useEffect(() => {
    if (!inviteToken) {
      setLoading(false);
      setError(t('artistSignContract.invalidLink'));
      return;
    }

    const fetchApp = async () => {
      const { data: inviteRows, error: fetchErr } = await supabase.rpc(
        'get_artist_application_by_invite_token',
        { p_token: inviteToken }
      );
      const data = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;

      if (fetchErr || !data) {
        setError(t('artistSignContract.invalidLink'));
        setLoading(false);
        return;
      }

      if (data.status !== 'qualified') {
        setError(t('artistSignContract.invalidLink'));
        setLoading(false);
        return;
      }

      if (data.contract_signed_at) {
        navigate(`/signup?invite=${inviteToken}`, { replace: true });
        return;
      }

      setApp(data);
      setLoading(false);
    };

    fetchApp();
  }, [inviteToken, navigate, t]);

  const handleSign = async () => {
    if (!inviteToken || !app) return;
    setSigning(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
      const res = await fetch(`${supabaseUrl}/functions/v1/sign-artist-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
        },
        body: JSON.stringify({ invite_token: inviteToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('artistSignContract.invalidLink'));
        setSigning(false);
        return;
      }
      const signupUrl = data.signup_url || `${window.location.origin}/signup?invite=${inviteToken}`;
      window.location.href = signupUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('artistSignContract.invalidLink'));
      setSigning(false);
    }
  };

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4 pt-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
          <p className="text-gray-400">{t('artistSignContract.signing')}</p>
        </div>
      </div>
    );
  }

  if (error && !app) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4 pt-24">
        <div className="relative z-10 w-full max-w-md">
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!app) return null;

  const displayName = app.stage_name || app.first_name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4 pt-24 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <FileSignature className="w-7 h-7 text-purple-400" />
            {t('artistSignContract.title')}
          </h1>
          <p className="text-purple-200 mt-1">{t('artistSignContract.welcome', { name: displayName })}</p>
        </div>

        <div className="bg-gray-900/90 p-6 rounded-xl shadow-xl border border-white/5 space-y-5">
          <p className="text-gray-300 text-sm">{t('artistSignContract.intro')}</p>

          <div className="bg-gray-800/80 p-4 rounded-lg border border-purple-500/20">
            <h2 className="text-white font-semibold mb-2">{t('artistSignContract.contractTitle')}</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{t('artistSignContract.contractBody')}</p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSign}
            disabled={signing}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
          >
            {signing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('artistSignContract.signing')}
              </>
            ) : (
              <>
                <FileSignature className="w-5 h-5" />
                {t('artistSignContract.signButton')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtistSignContract;
