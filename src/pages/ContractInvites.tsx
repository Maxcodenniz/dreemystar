import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { FileText, Mail, Copy, Check, Loader2 } from 'lucide-react';

const ContractInvites: React.FC = () => {
  const [email, setEmail] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    contract_number: string;
    registration_link: string;
    temp_password: string;
    email_sent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState<'link' | 'password' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-contract-artist-invite', {
        body: {
          email: email.trim(),
          contract_number: contractNumber.trim() || undefined,
        },
      });
      if (fnError) {
        setError(fnError.message || 'Failed to create invite');
        return;
      }
      if (data?.error) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to create invite');
        return;
      }
      if (!data?.contract_number || !data?.registration_link || !data?.temp_password) {
        setError('Invalid response from server. Make sure the create-contract-artist-invite Edge Function is deployed.');
        return;
      }
      setSuccess({
        contract_number: data.contract_number,
        registration_link: data.registration_link,
        temp_password: data.temp_password,
        email_sent: data.email_sent ?? false,
      });
      setEmail('');
      setContractNumber('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(
        msg === 'Failed to fetch'
          ? 'Could not reach the server. Check your connection and that the create-contract-artist-invite Edge Function is deployed in Supabase.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: 'link' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText className="w-7 h-7 text-purple-400" />
          Contract invites
        </h2>
        <p className="text-gray-400 mt-1 text-sm">
          Create a contract-based registration link and send it to the artist by email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-6 rounded-xl bg-gray-900/50 border border-white/10">
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">Artist email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="artist@example.com"
            required
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">Contract number (optional)</label>
          <input
            type="text"
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
            placeholder="e.g. CONTRACT-2025-001 or leave blank to auto-generate"
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <Mail className="w-5 h-5" />
              Create invite & send email
            </>
          )}
        </button>
      </form>

      {success && (
        <div className="mt-6 p-6 rounded-xl bg-green-500/10 border border-green-500/30 space-y-4">
          <p className="text-green-400 font-medium flex items-center gap-2">
            <Check className="w-5 h-5" />
            Invite created. {success.email_sent ? 'Email sent to the artist.' : 'Email could not be sent (check Resend config).'}
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Contract number:</span>
              <span className="text-white font-mono">{success.contract_number}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Temporary password:</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono">{success.temp_password}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(success.temp_password, 'password')}
                  className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                  title="Copy"
                >
                  {copied === 'password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="pt-2">
              <span className="text-gray-400 block mb-1">Registration link:</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={success.registration_link}
                  className="flex-1 px-3 py-2 rounded bg-gray-800 border border-white/10 text-white text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(success.registration_link, 'link')}
                  className="p-2 rounded hover:bg-white/10 text-gray-400 hover:text-white flex-shrink-0"
                  title="Copy link"
                >
                  {copied === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <p className="text-gray-500 text-xs">Share the contract number and temporary password with the artist. They open the link and enter these to register.</p>
        </div>
      )}
    </div>
  );
};

export default ContractInvites;
