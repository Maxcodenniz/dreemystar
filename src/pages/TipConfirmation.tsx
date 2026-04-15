import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Gift, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { takePawapayTipContext } from '../utils/pawapayCheckoutContext';

const TipConfirmation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [tipId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    const tid = sp.get('tip_id');
    if (tid) return tid;
    const dep = sp.get('deposit_id') ?? sp.get('depositId');
    return dep ? takePawapayTipContext(dep) : null;
  });
  const [verified, setVerified] = useState(false);
  const [tipData, setTipData] = useState<{
    amount: number;
    artistName: string;
    artistProfileId: string | null;
    watchEventId: string | null;
    message: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionId = searchParams.get('session_id');
  const provider = searchParams.get('provider') || (tipId ? 'pawapay' : 'stripe');

  useEffect(() => {
    const verifyTip = async () => {
      if (!tipId) {
        setLoading(false);
        return;
      }

      try {
        // Check tip status
        const { data: tip, error } = await supabase
          .from('tips')
          .select(`
            id,
            amount,
            message,
            status,
            artist_id,
            event_id,
            unregistered_artist_name,
            profiles:artist_id (
              username,
              full_name
            )
          `)
          .eq('id', tipId)
          .single();

        if (error) {
          console.error('Error fetching tip:', error);
          setLoading(false);
          return;
        }

        if (tip && tip.status === 'completed') {
          const unreg =
            typeof tip.unregistered_artist_name === 'string' ? tip.unregistered_artist_name.trim() : '';
          setTipData({
            amount: tip.amount,
            artistName:
              (tip.profiles as { username?: string; full_name?: string } | null)?.username
              || (tip.profiles as { full_name?: string } | null)?.full_name
              || unreg
              || 'Artist',
            artistProfileId: tip.artist_id,
            watchEventId: typeof tip.event_id === 'string' ? tip.event_id : null,
            message: tip.message,
          });
          setVerified(true);
        } else {
          // If tip is still pending, check payment status
          if (provider === 'stripe' && sessionId) {
            // For Stripe, the webhook should have updated it by now
            // Poll for a few seconds to see if it updates
            let attempts = 0;
            const pollInterval = setInterval(async () => {
              attempts++;
              const { data: updatedTip } = await supabase
                .from('tips')
                .select(
                  'status, amount, message, artist_id, event_id, unregistered_artist_name, profiles:artist_id (username, full_name)',
                )
                .eq('id', tipId)
                .single();

              if (updatedTip?.status === 'completed') {
                clearInterval(pollInterval);
                const unreg =
                  typeof updatedTip.unregistered_artist_name === 'string'
                    ? updatedTip.unregistered_artist_name.trim()
                    : '';
                setTipData({
                  amount: updatedTip.amount,
                  artistName:
                    (updatedTip.profiles as { username?: string; full_name?: string } | null)?.username
                    || (updatedTip.profiles as { full_name?: string } | null)?.full_name
                    || unreg
                    || 'Artist',
                  artistProfileId: updatedTip.artist_id,
                  watchEventId: typeof updatedTip.event_id === 'string' ? updatedTip.event_id : null,
                  message: updatedTip.message,
                });
                setVerified(true);
                setLoading(false);
              } else if (attempts >= 10) {
                clearInterval(pollInterval);
                setLoading(false);
              }
            }, 1000);

            return () => clearInterval(pollInterval);
          } else if ((provider === 'pawapay' || provider === 'dusupay') && tipId) {
            let attempts = 0;
            const pollInterval = setInterval(async () => {
              attempts++;
              const { data: updatedTip } = await supabase
                .from('tips')
                .select(
                  'status, amount, message, artist_id, event_id, unregistered_artist_name, profiles:artist_id (username, full_name)',
                )
                .eq('id', tipId)
                .single();

              if (updatedTip?.status === 'completed') {
                clearInterval(pollInterval);
                const unreg =
                  typeof updatedTip.unregistered_artist_name === 'string'
                    ? updatedTip.unregistered_artist_name.trim()
                    : '';
                setTipData({
                  amount: updatedTip.amount,
                  artistName:
                    (updatedTip.profiles as { username?: string; full_name?: string } | null)?.username
                    || (updatedTip.profiles as { full_name?: string } | null)?.full_name
                    || unreg
                    || 'Artist',
                  artistProfileId: updatedTip.artist_id,
                  watchEventId: typeof updatedTip.event_id === 'string' ? updatedTip.event_id : null,
                  message: updatedTip.message,
                });
                setVerified(true);
                setLoading(false);
              } else if (attempts >= 24) {
                clearInterval(pollInterval);
                setLoading(false);
              }
            }, 500);

            return () => clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Error verifying tip:', err);
      } finally {
        setLoading(false);
      }
    };

    verifyTip();
  }, [tipId, sessionId, provider]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500/30 border-t-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Verifying tip payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {verified && tipData ? (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center animate-bounce">
              <Gift className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Tip Sent Successfully!</h1>
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-500 mr-2" />
                <span className="text-xl font-bold text-white">${tipData.amount.toFixed(2)}</span>
              </div>
              <p className="text-gray-300 mb-2">
                Your tip has been sent to <span className="text-yellow-400 font-semibold">{tipData.artistName}</span>
              </p>
              {tipData.message && (
                <div className="mt-4 p-4 bg-gray-800/50 rounded-lg">
                  <p className="text-gray-400 text-sm mb-1">Your message:</p>
                  <p className="text-gray-200 italic">"{tipData.message}"</p>
                </div>
              )}
            </div>
            <div className="flex gap-4 justify-center">
              <Link
                to={
                  tipData.artistProfileId
                    ? `/artist/${tipData.artistProfileId}`
                    : tipData.watchEventId
                      ? `/watch/${tipData.watchEventId}`
                      : '/'
                }
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold transition-all duration-300 shadow-lg"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>{tipData.artistProfileId ? 'Back to Artist' : 'Back to event'}</span>
              </Link>
              <Link
                to="/"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition-all duration-300"
              >
                <span>Go Home</span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-700 flex items-center justify-center">
              <Gift className="w-10 h-10 text-gray-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Processing Tip...</h1>
            <p className="text-gray-400 mb-6">
              We're verifying your tip payment. This may take a few moments.
            </p>
            <Link
              to="/"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold transition-all duration-300 shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Go Home</span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default TipConfirmation;
