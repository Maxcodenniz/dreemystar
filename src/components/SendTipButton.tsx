import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Gift, CreditCard, Smartphone } from 'lucide-react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabaseClient';
import { extractFunctionError } from '../utils/ticketUtils';
import {
  useMobileMoneyCheckoutVisible,
  useMobileMoneyNeedsWalletFields,
  useMobileMoneyPayments,
} from '../contexts/MobileMoneyPaymentContext';
import { startMobileMoneyTipCheckout } from '../utils/mobileMoneyCheckout';
import { paymentCountryFields } from '../utils/paymentCountryHint';
import { mobileMoneyRoutingFields } from '../utils/mobileMoneyRoutingFields';
import { stashPawapayTipContext } from '../utils/pawapayCheckoutContext';
import MobileMoneyCountryModal from './MobileMoneyCountryModal';
import {
  MobileMoneyCountryOperatorFields,
  isMobileMoneySelectionComplete,
  type MobileMoneySelection,
} from './MobileMoneyCountryOperatorFields';

interface SendTipButtonProps {
  artistId: string;
  artistName?: string;
  variant?: 'default' | 'compact';
  className?: string;
}

type PendingTipMm = {
  amount: number;
  message: string | null;
};

const SendTipButton: React.FC<SendTipButtonProps> = ({
  artistId,
  artistName = 'Artist',
  variant = 'default',
  className = '',
}) => {
  const { t } = useTranslation();
  const { user, userProfile } = useStore();
  const showMobileMoney = useMobileMoneyCheckoutVisible();
  const needsWalletFields = useMobileMoneyNeedsWalletFields();
  const { pawapayEnabled } = useMobileMoneyPayments();
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'mobile_money' | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [mobileMoneySelection, setMobileMoneySelection] = useState<MobileMoneySelection>({
    countryCode: '',
    mobileOperator: '',
  });
  const [mobileMoneyCapabilityAvailable, setMobileMoneyCapabilityAvailable] = useState<boolean | null>(null);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [tipUsdForModal, setTipUsdForModal] = useState(0);
  const pendingTipMmRef = useRef<PendingTipMm | null>(null);

  const onMobileMoneyCapabilitiesResolved = useCallback((detail: { available: boolean }) => {
    setMobileMoneyCapabilityAvailable(detail.available);
  }, []);

  useEffect(() => {
    if (!showTipModal) {
      setMobileMoneyCapabilityAvailable(null);
    }
  }, [showTipModal]);

  const presetAmounts = [5, 10, 25, 50, 100];

  const handleTipClick = () => {
    setShowTipModal(true);
  };

  const isGuest = !user;
  const emailRequired = isGuest;
  const emailValid = !emailRequired || (guestEmail.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()));
  const canSubmit = emailValid && (tipAmount || customAmount) && parseFloat(customAmount || tipAmount) > 0;

  const handleTipCountryContinue = async (payload: {
    paymentCountryAlpha3: string;
    paymentCurrency: string;
    paymentAmount: string;
  }) => {
    const p = pendingTipMmRef.current;
    if (!p) return;
    const email = user?.email ?? (isGuest ? guestEmail.trim() : undefined);
    const name = user?.user_metadata?.full_name ?? (isGuest ? guestName.trim() || undefined : undefined);
    try {
      const { data, error } = await supabase.functions.invoke('create-tip-pawapay-payment', {
        body: {
          artistId,
          amount: p.amount,
          message: p.message,
          email: email || undefined,
          name: name || undefined,
          phone: userProfile?.phone || undefined,
          ...payload,
        },
      });
      if (error) {
        throw new Error(await extractFunctionError(error));
      }
      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Payment could not be started.');
      }
      if (!data?.url) {
        throw new Error('Invalid response from payment service.');
      }
      const depositId = typeof data.deposit_id === 'string' ? data.deposit_id : undefined;
      const tipId = typeof (data as { tipId?: string }).tipId === 'string' ? (data as { tipId: string }).tipId : undefined;
      if (depositId && tipId) {
        stashPawapayTipContext(depositId, tipId);
      }
      window.location.href = data.url as string;
    } catch (e) {
      throw e instanceof Error ? e : new Error('Payment could not be started.');
    }
  };

  const handleSendTip = async (method: 'stripe' | 'mobile_money') => {
    const amount = customAmount || tipAmount;
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid tip amount');
      return;
    }
    if (isGuest && (!guestEmail.trim() || !emailValid)) {
      alert('Please enter a valid email address so we can send your receipt.');
      return;
    }

    setProcessing(true);
    setPaymentMethod(method);

    const email = user?.email ?? (isGuest ? guestEmail.trim() : undefined);
    const name = user?.user_metadata?.full_name ?? (isGuest ? guestName.trim() || undefined : undefined);

    try {
      if (method === 'stripe') {
        const { data, error } = await supabase.functions.invoke('create-tip-payment', {
          body: {
            artistId,
            amount: parseFloat(amount),
            message: message.trim() || null,
            email: email || undefined,
          },
        });

        if (error) {
          const errorMessage = await extractFunctionError(error);
          alert(errorMessage);
          return;
        }

        if (!data) {
          alert('Invalid response from payment service. Please try again.');
          return;
        }

        if (data.error) {
          alert(data.error);
          return;
        }

        if (data.url) {
          window.location.href = data.url;
          return;
        }

        if (data.sessionId) {
          const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
          if (!stripePublicKey) {
            alert('Stripe is not configured');
            return;
          }

          const { loadStripe } = await import('@stripe/stripe-js');
          const stripe = await loadStripe(stripePublicKey);

          if (!stripe) {
            alert('Failed to load Stripe');
            return;
          }

          const { error: redirectError } = await stripe.redirectToCheckout({
            sessionId: data.sessionId,
          });

          if (redirectError) {
            alert(redirectError.message || 'Failed to redirect to checkout');
          }
        }
      } else if (method === 'mobile_money') {
        if (needsWalletFields) {
          if (mobileMoneyCapabilityAvailable === false || mobileMoneyCapabilityAvailable === null) {
            return;
          }
          if (!isMobileMoneySelectionComplete(mobileMoneySelection)) {
            alert('Select your country and mobile operator for Mobile Money.');
            return;
          }
          const res = await startMobileMoneyTipCheckout({
            artistId,
            amount: parseFloat(amount),
            message: message.trim() || null,
            email: email || undefined,
            name: name || undefined,
            phone: userProfile?.phone || undefined,
            ...(needsWalletFields ? mobileMoneyRoutingFields(mobileMoneySelection) : {}),
            ...paymentCountryFields({
              profileCountry: userProfile?.country,
              profilePhone: userProfile?.phone,
            }),
          });
          if (res.error) {
            alert(res.error);
            return;
          }
          if (res.url) window.location.href = res.url;
        } else if (pawapayEnabled) {
          const n = parseFloat(amount);
          pendingTipMmRef.current = {
            amount: n,
            message: message.trim() || null,
          };
          setTipUsdForModal(n);
          setCountryModalOpen(true);
        }
      }
    } catch (error: unknown) {
      console.error('Error sending tip:', error);
      alert(error instanceof Error ? error.message : 'Failed to send tip. Please try again.');
    } finally {
      setProcessing(false);
      setPaymentMethod(null);
    }
  };

  const tipModalShared = {
    artistName,
    tipAmount,
    setTipAmount,
    customAmount,
    setCustomAmount,
    message,
    setMessage,
    processing,
    paymentMethod,
    isGuest,
    guestEmail,
    setGuestEmail,
    guestName,
    setGuestName,
    canSubmit,
    onSendStripe: () => handleSendTip('stripe'),
    onSendMobileMoney: showMobileMoney ? () => handleSendTip('mobile_money') : undefined,
    onClose: () => {
      setShowTipModal(false);
      setTipAmount('');
      setCustomAmount('');
      setMessage('');
      setGuestEmail('');
      setGuestName('');
      setPaymentMethod(null);
      setMobileMoneySelection({ countryCode: '', mobileOperator: '' });
    },
    presetAmounts,
    mobileMoneySelection,
    setMobileMoneySelection,
    showMobileMoney: !!showMobileMoney,
    needsWalletFields,
    mobileMoneyCapabilityAvailable,
    onMobileMoneyCapabilitiesResolved,
  };

  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={handleTipClick}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all duration-300 shadow-md hover:shadow-lg bg-gradient-to-r from-yellow-500 to-orange-500 text-white border border-yellow-400/50 hover:from-yellow-600 hover:to-orange-600 ${className}`}
        >
          <Gift className="w-4 h-4" />
          <span className="text-sm">{t('common.tip')}</span>
        </button>
        {showTipModal && <TipModal {...tipModalShared} />}
        <MobileMoneyCountryModal
          open={countryModalOpen}
          onClose={() => {
            setCountryModalOpen(false);
            pendingTipMmRef.current = null;
          }}
          eventPriceUsd={0}
          usdTotalOverride={tipUsdForModal}
          onContinue={handleTipCountryContinue}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleTipClick}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 text-yellow-300 hover:from-yellow-600/30 hover:to-orange-600/30 ${className}`}
      >
        <Gift className="w-4 h-4" />
        <span>{t('common.sendATip')}</span>
      </button>
      {showTipModal && <TipModal {...tipModalShared} />}
      <MobileMoneyCountryModal
        open={countryModalOpen}
        onClose={() => {
          setCountryModalOpen(false);
          pendingTipMmRef.current = null;
        }}
        eventPriceUsd={0}
        usdTotalOverride={tipUsdForModal}
        onContinue={handleTipCountryContinue}
      />
    </>
  );
};

interface TipModalProps {
  artistName: string;
  tipAmount: string;
  setTipAmount: (value: string) => void;
  customAmount: string;
  setCustomAmount: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  processing: boolean;
  paymentMethod: 'stripe' | 'mobile_money' | null;
  isGuest: boolean;
  guestEmail: string;
  setGuestEmail: (value: string) => void;
  guestName: string;
  setGuestName: (value: string) => void;
  canSubmit: boolean;
  onSendStripe: () => void;
  onSendMobileMoney?: () => void;
  onClose: () => void;
  presetAmounts: number[];
  mobileMoneySelection: MobileMoneySelection;
  setMobileMoneySelection: (v: MobileMoneySelection) => void;
  showMobileMoney: boolean;
  needsWalletFields: boolean;
  mobileMoneyCapabilityAvailable: boolean | null;
  onMobileMoneyCapabilitiesResolved: (detail: { available: boolean }) => void;
}

const MODAL_Z = 10000;

const TipModal: React.FC<TipModalProps> = ({
  artistName,
  tipAmount,
  setTipAmount,
  customAmount,
  setCustomAmount,
  message,
  setMessage,
  processing,
  paymentMethod,
  isGuest,
  guestEmail,
  setGuestEmail,
  guestName,
  setGuestName,
  canSubmit,
  onSendStripe,
  onSendMobileMoney,
  onClose,
  presetAmounts,
  mobileMoneySelection,
  setMobileMoneySelection,
  showMobileMoney,
  needsWalletFields,
  mobileMoneyCapabilityAvailable,
  onMobileMoneyCapabilitiesResolved,
}) => {
  const { t } = useTranslation();
  const [mmWalletExpanded, setMmWalletExpanded] = useState(false);
  const mmReady = isMobileMoneySelectionComplete(mobileMoneySelection);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: MODAL_Z }}
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-white">{t('common.sendATipTo', { name: artistName })}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isGuest && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="block text-gray-300 mb-1 font-medium">Email <span className="text-red-400">*</span></label>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <p className="text-gray-500 text-xs mt-1">We’ll send your receipt to this email.</p>
            </div>
            <div>
              <label className="block text-gray-300 mb-1 font-medium">Name (optional)</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-gray-300 mb-3 font-medium">Select Amount</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {presetAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => {
                  setTipAmount(amount.toString());
                  setCustomAmount('');
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  tipAmount === amount.toString()
                    ? 'bg-gradient-to-r from-yellow-600 to-orange-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                ${amount}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className="block text-gray-300 mb-2 text-sm">Or enter custom amount</label>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setTipAmount('');
              }}
              placeholder="$0.00"
              min="0"
              step="0.01"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        </div>

        {showMobileMoney && onSendMobileMoney && needsWalletFields && mmWalletExpanded ? (
          <div className="mb-6 p-3 rounded-xl bg-violet-950/30 border border-violet-500/20">
            <p className="text-sm text-violet-200 mb-2 font-medium">
              {t('cart.mobileMoneyWallet', 'Mobile Money wallet')}
            </p>
            <MobileMoneyCountryOperatorFields
              value={mobileMoneySelection}
              onChange={setMobileMoneySelection}
              disabled={processing}
              mobileMoneyIntent
              onCapabilitiesResolved={onMobileMoneyCapabilitiesResolved}
            />
          </div>
        ) : null}

        <div className="mb-6">
          <label className="block text-gray-300 mb-2 font-medium">Message (Optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message..."
            rows={3}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3">
            <button
              onClick={onSendStripe}
              disabled={processing || !canSubmit || paymentMethod === 'stripe'}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {processing && paymentMethod === 'stripe' ? 'Processing...' : 'Pay with Card'}
            </button>
            {onSendMobileMoney ? (
              <button
                type="button"
                onClick={() => {
                  if (needsWalletFields && !mmWalletExpanded) {
                    setMmWalletExpanded(true);
                    return;
                  }
                  setTimeout(() => onSendMobileMoney(), 0);
                }}
                disabled={
                  processing ||
                  !canSubmit ||
                  paymentMethod === 'mobile_money' ||
                  (needsWalletFields &&
                    mmWalletExpanded &&
                    (mobileMoneyCapabilityAvailable === null ||
                      (mobileMoneyCapabilityAvailable === true && !mmReady)))
                }
                className="w-full px-4 py-2.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Smartphone className="w-4 h-4 mr-2" />
                {processing && paymentMethod === 'mobile_money' ? 'Processing...' : t('cart.payWithMobileMoney')}
              </button>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            disabled={processing}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SendTipButton;
