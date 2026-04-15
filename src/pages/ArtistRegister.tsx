import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { Navigate } from 'react-router-dom';
import SignUpForm from '../components/auth/SignUpForm';
import { FileText, Loader2, ArrowRight } from 'lucide-react';

const ArtistRegister: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const refToken = searchParams.get('ref') || '';
  const { user } = useStore();

  const [step, setStep] = useState<'validate' | 'signup'>('validate');
  const [contractNumber, setContractNumber] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState<{ registration_token: string; email?: string } | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
      const res = await fetch(`${supabaseUrl}/functions/v1/validate-contract-invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
          },
          body: JSON.stringify({
            contract_number: contractNumber.trim() || undefined,
            temp_password: tempPassword,
            ref: refToken || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('artistRegister.validationFailed'));
        return;
      }
      setValidated({
        registration_token: data.registration_token,
        email: data.email,
      });
      setStep('signup');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('artistRegister.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'signup' && validated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4 pt-24 relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <SignUpForm
            contractInvite={{
              registrationToken: validated.registration_token,
              email: validated.email,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4 pt-24 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <FileText className="w-7 h-7 text-purple-400" />
            {t('artistRegister.title')}
          </h1>
          <p className="text-gray-400 text-sm mt-1">{t('artistRegister.subtitle')}</p>
        </div>
        <form onSubmit={handleValidate} className="bg-gray-900 p-8 rounded-lg shadow-xl space-y-4">
          <div>
            <label className="block text-gray-300 mb-2">Contract number</label>
            <input
              type="text"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              placeholder="From your contract email"
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-2">{t('artistRegister.tempPassword')}</label>
            <input
              type="password"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder={t('artistRegister.placeholderFromEmail')}
              required
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('artistRegister.checking')}
              </>
            ) : (
              <>
                {t('artistRegister.continue')}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ArtistRegister;
