import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { extractFunctionError } from '../utils/ticketUtils';
import { useMobileMoneyCheckoutVisible, useMobileMoneyNeedsWalletFields } from '../contexts/MobileMoneyPaymentContext';
import { startMobileMoneyTicketCheckout } from '../utils/mobileMoneyCheckout';
import { paymentCountryFields } from '../utils/paymentCountryHint';
import { mobileMoneyRoutingFields } from '../utils/mobileMoneyRoutingFields';
import {
  MobileMoneyCountryOperatorFields,
  isMobileMoneySelectionComplete,
  type MobileMoneySelection,
} from '../components/MobileMoneyCountryOperatorFields';
import { Ticket, CreditCard, Smartphone, ArrowLeft } from 'lucide-react';

const BUNDLES = [
  { type: '3_ticket' as const, base: 7.99, total: 9.59, credits: 3, nameKey: 'bundle3Name', descKey: 'bundle3Desc' as const },
  { type: '5_ticket' as const, base: 12.99, total: 15.59, credits: 5, nameKey: 'bundle5Name', descKey: 'bundle5Desc' as const, popular: true },
];

const Bundles: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, userProfile } = useStore();
  const showMobileMoney = useMobileMoneyCheckoutVisible();
  const needsWalletFields = useMobileMoneyNeedsWalletFields();
  const [mobileMoneySelection, setMobileMoneySelection] = useState<MobileMoneySelection>({
    countryCode: '',
    mobileOperator: '',
  });
  const [mobileMoneyCapabilityAvailable, setMobileMoneyCapabilityAvailable] = useState<boolean | null>(null);
  const [mmWalletExpanded, setMmWalletExpanded] = useState(false);
  const onMobileMoneyCapabilitiesResolved = useCallback((detail: { available: boolean }) => {
    setMobileMoneyCapabilityAvailable(detail.available);
  }, []);

  useEffect(() => {
    if (!showMobileMoney) {
      setMmWalletExpanded(false);
      setMobileMoneyCapabilityAvailable(null);
    }
  }, [showMobileMoney]);

  const [purchasing, setPurchasing] = useState<'3_ticket' | '5_ticket' | null>(null);
  const [bundlesEnabled, setBundlesEnabled] = useState(true);

  useEffect(() => {
    const fetchBundlesEnabled = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'bundles_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setBundlesEnabled(data.value === true || data.value === 'true');
        }
      } catch {
        setBundlesEnabled(true);
      }
    };
    fetchBundlesEnabled();
  }, []);

  const handleStripeBundle = async (bundleType: '3_ticket' | '5_ticket') => {
    if (!user) {
      alert(t('bundles.alertSignIn'));
      navigate('/login');
      return;
    }
    setPurchasing(bundleType);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          bundleType: bundleType as string,
          userId: user.id,
          email: user.email ?? undefined,
          eventIds: [],
        },
      });
      if (error) {
        const msg = await extractFunctionError(error);
        alert(msg);
        return;
      }
      if (data?.error) {
        alert(data.error);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.sessionId) {
        const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
        if (stripePublicKey) {
          const { loadStripe } = await import('@stripe/stripe-js');
          const stripe = await loadStripe(stripePublicKey);
          if (stripe) await stripe.redirectToCheckout({ sessionId: data.sessionId });
        }
      }
    } catch (err: any) {
      alert(err?.message || t('bundles.alertCheckoutFailed'));
    } finally {
      setPurchasing(null);
    }
  };

  const handleMobileMoneyBundle = async (bundleType: '3_ticket' | '5_ticket') => {
    if (!user) {
      alert(t('bundles.alertSignIn'));
      navigate('/login');
      return;
    }
    if (needsWalletFields) {
      if (mobileMoneyCapabilityAvailable === false || mobileMoneyCapabilityAvailable === null) {
        return;
      }
      if (!isMobileMoneySelectionComplete(mobileMoneySelection)) {
        alert(t('watch.selectCountryOperatorMm', 'Select your country and mobile operator for Mobile Money.'));
        return;
      }
    }
    setPurchasing(bundleType);
    try {
      const res = await startMobileMoneyTicketCheckout({
        bundleType: bundleType as string,
        userId: user.id,
        email: user.email ?? undefined,
        eventIds: [],
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
      else alert(t('bundles.alertInvalidResponse'));
    } catch (err: any) {
      alert(err?.message || t('bundles.alertErrorOccurred'));
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('bundles.back')}
        </Link>
        <h1 className="text-3xl font-bold mb-2">{t('bundles.title')}</h1>
        <p className="text-gray-400 mb-10">
          {t('bundles.subtitle')}
        </p>

        {!bundlesEnabled && (
          <div className="mb-8 p-4 rounded-xl bg-gray-700/50 border border-gray-500/30 text-gray-300">
            <p className="font-medium">{t('bundles.unavailable')}</p>
            <p className="text-sm mt-1 text-gray-400">{t('bundles.unavailableHint')}</p>
          </div>
        )}

        {!user && bundlesEnabled && (
          <div className="mb-8 p-4 rounded-xl bg-amber-900/30 border border-amber-500/30 text-amber-200">
            <p>
              {t('bundles.signInRequired')}{' '}
              <Link to="/login" className="underline font-medium">{t('bundles.signIn')}</Link>
              {' or '}
              <Link to="/signup" className="underline font-medium">{t('bundles.signUp')}</Link>.
            </p>
          </div>
        )}

        {showMobileMoney && needsWalletFields && bundlesEnabled && user && mmWalletExpanded ? (
          <div className="mb-8 p-4 rounded-xl bg-violet-950/30 border border-violet-500/25 max-w-xl">
            <p className="text-sm font-medium text-violet-200 mb-3">
              {t('cart.mobileMoneyWallet', 'Mobile Money wallet')}
            </p>
            <MobileMoneyCountryOperatorFields
              value={mobileMoneySelection}
              onChange={setMobileMoneySelection}
              disabled={purchasing !== null}
              mobileMoneyIntent
              onCapabilitiesResolved={onMobileMoneyCapabilitiesResolved}
            />
          </div>
        ) : null}

        {bundlesEnabled && (
        <div className="grid gap-6 md:grid-cols-2">
          {BUNDLES.map((bundle) => (
            <div
              key={bundle.type}
              className={`rounded-2xl border p-6 bg-gray-800/80 ${
                bundle.popular ? 'border-purple-500/50 ring-1 ring-purple-500/20' : 'border-white/10'
              }`}
            >
              {bundle.popular && (
                <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">{t('bundles.bestValue')}</span>
              )}
              <div className="flex items-center gap-2 mt-1 mb-3">
                <Ticket className="h-6 w-6 text-purple-400" />
                <h2 className="text-xl font-bold">{t(`bundles.${bundle.nameKey}`)}</h2>
              </div>
              <p className="text-gray-400 text-sm mb-4">{t(`bundles.${bundle.descKey}`)}</p>
              <p className="text-3xl font-bold text-white mb-1">${bundle.total.toFixed(2)}</p>
              <p className="text-gray-500 text-xs mb-6">{t('bundles.feeAndVat', { base: bundle.base.toFixed(2) })}</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleStripeBundle(bundle.type)}
                  disabled={!user || purchasing !== null}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard className="h-5 w-5" />
                  {purchasing === bundle.type ? t('bundles.processing') : t('bundles.payWithCard')}
                </button>
                {showMobileMoney ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (needsWalletFields && !mmWalletExpanded) {
                        setMmWalletExpanded(true);
                        return;
                      }
                      setTimeout(() => void handleMobileMoneyBundle(bundle.type), 0);
                    }}
                    disabled={
                      !user ||
                      purchasing !== null ||
                      (needsWalletFields &&
                        mmWalletExpanded &&
                        (mobileMoneyCapabilityAvailable === null ||
                          (mobileMoneyCapabilityAvailable === true &&
                            !isMobileMoneySelectionComplete(mobileMoneySelection))))
                    }
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Smartphone className="h-4 w-4" />
                    {t('bundles.payWithMobileMoney')}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};

export default Bundles;
