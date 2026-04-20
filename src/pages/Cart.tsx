import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trash2, ShoppingBag, ArrowLeft, CheckCircle, CreditCard, Smartphone, Ticket } from 'lucide-react';
import { useCartStore, CartItem } from '../store/useCartStore';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabaseClient';
import { getEventsWithTickets, extractFunctionError } from '../utils/ticketUtils';
import PhoneInput, { type PhoneValue } from '../components/PhoneInput';
import { formatFullPhone, parseFullPhone, getDefaultDialCodeFromBrowser } from '../utils/phoneCountryCodes';
import {
  useMobileMoneyCheckoutVisible,
  useMobileMoneyNeedsWalletFields,
  useMobileMoneyPayments,
} from '../contexts/MobileMoneyPaymentContext';
import { startMobileMoneyTicketCheckout } from '../utils/mobileMoneyCheckout';
import { paymentCountryFields } from '../utils/paymentCountryHint';
import { mobileMoneyRoutingFields } from '../utils/mobileMoneyRoutingFields';
import { stashPawapayTicketCheckoutContext } from '../utils/pawapayCheckoutContext';
import MobileMoneyCountryModal from '../components/MobileMoneyCountryModal';
import {
  MobileMoneyCountryOperatorFields,
  isMobileMoneySelectionComplete,
  type MobileMoneySelection,
} from '../components/MobileMoneyCountryOperatorFields';

const Cart: React.FC = () => {
  const { t, i18n } = useTranslation();
  const showMobileMoney = useMobileMoneyCheckoutVisible();
  const needsWalletFields = useMobileMoneyNeedsWalletFields();
  const { pawapayEnabled } = useMobileMoneyPayments();
  const navigate = useNavigate();
  const { pathname: cartReturnPath } = useLocation();
  const { user } = useStore();
  const { items, removeItem, clearCart, getTotalPrice, guestEmail, setGuestEmail, guestPhone, setGuestPhone } = useCartStore();
  const { userProfile } = useStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<Record<string, any>>({});
  const [eventsWithTickets, setEventsWithTickets] = useState<string[]>([]);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState(guestEmail || '');
  const [phoneValue, setPhoneValue] = useState<PhoneValue>({ dialCode: getDefaultDialCodeFromBrowser(), localNumber: '' });
  const [bundlesEnabled, setBundlesEnabled] = useState(true);
  const [mobileMoneySelection, setMobileMoneySelection] = useState<MobileMoneySelection>({
    countryCode: '',
    mobileOperator: '',
  });
  const [mobileMoneyCapabilityAvailable, setMobileMoneyCapabilityAvailable] = useState<boolean | null>(null);
  const [mmWalletExpanded, setMmWalletExpanded] = useState(false);
  const [mobileMoneyCountryModalOpen, setMobileMoneyCountryModalOpen] = useState(false);

  const onMobileMoneyCapabilitiesResolved = useCallback((detail: { available: boolean }) => {
    setMobileMoneyCapabilityAvailable(detail.available);
  }, []);

  useEffect(() => {
    if (!showMobileMoney) {
      setMmWalletExpanded(false);
      setMobileMoneyCapabilityAvailable(null);
    }
  }, [showMobileMoney]);
  useEffect(() => {
    const source = guestPhone || userProfile?.phone;
    if (source) {
      const p = parseFullPhone(source);
      if (p) setPhoneValue({ dialCode: p.dialCode, localNumber: p.localNumber });
    }
  }, [guestPhone, userProfile?.phone]);

  // Fetch event details for items in cart
  useEffect(() => {
    const fetchEventDetails = async () => {
      if (items.length === 0) return;

      try {
        const eventIds = items.map(item => item.eventId);
        const { data, error } = await supabase
          .from('events')
          .select('id, title, image_url, price, start_time, description')
          .in('id', eventIds);

        if (error) throw error;

        const detailsMap: Record<string, any> = {};
        data?.forEach(event => {
          detailsMap[event.id] = event;
        });
        setEventDetails(detailsMap);
      } catch (err) {
        console.error('Error fetching event details:', err);
      }
    };

    fetchEventDetails();
  }, [items]);

  // Check for existing tickets when items, user, guest email, or guest phone changes
  useEffect(() => {
    const checkExistingTickets = async () => {
      if (items.length === 0) {
        setEventsWithTickets([]);
        return;
      }

      try {
        const eventIds = items.map(item => item.eventId);
        const userId = user?.id || null;
        const email = user?.email || guestEmail || null;
        const phone = userProfile?.phone || guestPhone || null;
        
        // Check by user_id first
        let eventsWithExistingTickets = await getEventsWithTickets(
          eventIds,
          userId,
          email
        );

        // If no tickets found and we have a phone, also check by phone
        if (eventsWithExistingTickets.length === 0 && phone && !userId) {
          try {
            const { data: ticketsByPhone } = await supabase
              .from('tickets')
              .select('event_id')
              .eq('phone', phone)
              .in('event_id', eventIds)
              .eq('status', 'active');

            if (ticketsByPhone && ticketsByPhone.length > 0) {
              eventsWithExistingTickets = ticketsByPhone.map(t => t.event_id);
            }
          } catch (phoneCheckError) {
            console.warn('Could not check tickets by phone:', phoneCheckError);
          }
        }

        setEventsWithTickets(eventsWithExistingTickets);

        // Automatically remove items from cart if tickets exist
        if (eventsWithExistingTickets.length > 0) {
          eventsWithExistingTickets.forEach(eventId => {
            removeItem(eventId);
          });
          console.log(`✅ Removed ${eventsWithExistingTickets.length} item(s) from cart - tickets already exist`);
        }

        // If there are events with existing tickets, show a warning
        if (eventsWithExistingTickets.length > 0) {
          const eventTitles = eventsWithExistingTickets
            .map(id => {
              const item = items.find(i => i.eventId === id);
              return item?.eventTitle || id;
            })
            .join(', ');
          console.warn(`User already has tickets for: ${eventTitles}`);
        }
      } catch (err) {
        console.error('Error checking existing tickets:', err);
      }
    };

    checkExistingTickets();
  }, [items, user, guestEmail, guestPhone, userProfile?.phone, removeItem]);

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

  const handleCheckout = async () => {
    if (items.length === 0) {
      setError(t('cart.emptyCart'));
      return;
    }

    // For guest users, require either email or phone
    const checkoutPhone =
      phoneValue.localNumber.trim() !== ''
        ? formatFullPhone(phoneValue.dialCode, phoneValue.localNumber)
        : (user?.id && userProfile?.phone) ? userProfile.phone : null;

    if (!user) {
      if (!guestEmail && !checkoutPhone) {
        setError(t('cart.enterEmailOrPhone'));
        return;
      }
    }

    // Validate email format if provided
    const checkoutEmail = user?.email || guestEmail;
    if (checkoutEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
      setError(t('cart.validEmail'));
      return;
    }

    // Validate phone format if provided
    if (checkoutPhone && checkoutPhone.length < 10) {
      setError(t('cart.validPhone'));
      return;
    }

    // Check if user already has tickets for any events in cart
    if (eventsWithTickets.length > 0) {
      const eventTitles = eventsWithTickets
        .map(id => {
          const item = items.find(i => i.eventId === id);
          return item?.eventTitle || id;
        })
        .join(', ');
      setError(t('cart.duplicateTickets', { titles: eventTitles }));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Create checkout session with multiple events
      // Phone already computed above

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventIds: items.map(item => item.eventId),
          email: checkoutEmail || undefined,
          phone: checkoutPhone || undefined,
          isCart: true,
          returnPath: cartReturnPath,
        },
      });

      if (error) {
        console.error('Error creating checkout session:', error);
        const errorMessage = await extractFunctionError(error);
        setError(errorMessage);
        setIsProcessing(false);
        return;
      }

      if (!data) {
        setError(t('cart.invalidResponse'));
        setIsProcessing(false);
        return;
      }

      if (data.error) {
        setError(data.error);
        setIsProcessing(false);
        return;
      }

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.sessionId) {
        // Fallback: redirect to Stripe checkout with session ID
        const stripe = await import('@stripe/stripe-js');
        const stripePromise = stripe.loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');
        const stripeInstance = await stripePromise;
        if (stripeInstance) {
          await stripeInstance.redirectToCheckout({ sessionId: data.sessionId });
        }
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      console.error('Full error object:', JSON.stringify(err, null, 2));
      
      // Try to extract error message
      let errorMessage = t('cart.errorDuringCheckout');
      
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error) {
        errorMessage = err.error;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  const handleMobileMoneyCheckout = async () => {
    if (items.length === 0) {
      setError(t('cart.emptyCart'));
      return;
    }
    const checkoutPhone =
      phoneValue.localNumber.trim() !== ''
        ? formatFullPhone(phoneValue.dialCode, phoneValue.localNumber)
        : (user?.id && userProfile?.phone) ? userProfile.phone : null;
    if (!user && !guestEmail && !checkoutPhone) {
      setError(t('cart.enterEmailOrPhone'));
      return;
    }
    const checkoutEmail = user?.email || guestEmail;
    if (checkoutEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
      setError(t('cart.validEmail'));
      return;
    }
    if (checkoutPhone && checkoutPhone.length < 10) {
      setError(t('cart.validPhone'));
      return;
    }
    if (eventsWithTickets.length > 0) {
      const eventTitles = eventsWithTickets
        .map(id => items.find(i => i.eventId === id)?.eventTitle || id)
        .join(', ');
      setError(t('cart.duplicateTickets', { titles: eventTitles }));
      return;
    }
    if (needsWalletFields) {
      if (mobileMoneyCapabilityAvailable === false || mobileMoneyCapabilityAvailable === null) {
        return;
      }
      if (!isMobileMoneySelectionComplete(mobileMoneySelection)) {
        setError(t('cart.selectCountryOperatorMm', 'Select your country and mobile operator for Mobile Money.'));
        return;
      }
    } else if (pawapayEnabled) {
      setMobileMoneyCountryModalOpen(true);
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const res = await startMobileMoneyTicketCheckout({
        eventIds: items.map(item => item.eventId),
        email: checkoutEmail || undefined,
        phone: checkoutPhone || undefined,
        isCart: true,
        returnPath: cartReturnPath,
        ...(needsWalletFields ? mobileMoneyRoutingFields(mobileMoneySelection) : {}),
        ...paymentCountryFields({
          profileCountry: userProfile?.country,
          dialCode: phoneValue.dialCode,
          profilePhone: checkoutPhone ?? userProfile?.phone,
        }),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.url) window.location.href = res.url;
    } catch (err: any) {
      setError(err?.message || t('cart.pleaseTryAgain'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCartMmCountryContinue = async (payload: {
    paymentCountryAlpha3: string;
    paymentCurrency: string;
    paymentAmount: string;
  }) => {
    const checkoutPhone =
      phoneValue.localNumber.trim() !== ''
        ? formatFullPhone(phoneValue.dialCode, phoneValue.localNumber)
        : user?.id && userProfile?.phone
          ? userProfile.phone
          : null;
    const checkoutEmail = user?.email || guestEmail;
    setIsProcessing(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-pawapay-payment', {
        body: {
          eventIds: items.map((item) => item.eventId),
          email: checkoutEmail || undefined,
          phone: checkoutPhone || undefined,
          userId: user?.id || undefined,
          isCart: true,
          returnPath: cartReturnPath,
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
        throw new Error(t('cart.invalidPaymentResponse', 'Invalid response from payment service.'));
      }
      const depositId = typeof data.deposit_id === 'string' ? data.deposit_id : undefined;
      if (depositId) {
        stashPawapayTicketCheckoutContext(depositId, {
          eventIds: items.map((item) => item.eventId),
          isCart: true,
          returnPath: cartReturnPath,
        });
      }
      window.location.href = data.url as string;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('cart.pleaseTryAgain'));
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBundleCheckout = async (bundleType: '3_ticket' | '5_ticket') => {
    if (!user) {
      setError(t('cart.signInForBundle'));
      return;
    }
    if (items.length !== (bundleType === '3_ticket' ? 3 : 5)) {
      setError(t('cart.cartMustHaveExactly', { count: bundleType === '3_ticket' ? 3 : 5 }));
      return;
    }
    if (eventsWithTickets.length > 0) {
      setError(t('cart.removeEventsWithTickets'));
      return;
    }
    const checkoutPhone =
      phoneValue.localNumber.trim() !== ''
        ? formatFullPhone(phoneValue.dialCode, phoneValue.localNumber)
        : userProfile?.phone ?? null;
    const checkoutEmail = user?.email ?? undefined;
    setIsProcessing(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          bundleType,
          bundleEventIds: items.map((item) => item.eventId),
          userId: user.id,
          email: checkoutEmail,
          phone: checkoutPhone || undefined,
          returnPath: cartReturnPath,
        },
      });
      if (error) {
        setError(await extractFunctionError(error));
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.sessionId) {
        const stripe = await import('@stripe/stripe-js');
        const stripeInstance = await stripe.loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');
        if (stripeInstance) await stripeInstance.redirectToCheckout({ sessionId: data.sessionId });
      }
    } catch (err: any) {
      setError(err?.message || t('cart.checkoutFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMobileMoneyBundleCheckout = async (bundleType: '3_ticket' | '5_ticket') => {
    if (!user) {
      setError(t('cart.signInForBundle'));
      return;
    }
    if (items.length !== (bundleType === '3_ticket' ? 3 : 5)) {
      setError(t('cart.cartMustHaveExactly', { count: bundleType === '3_ticket' ? 3 : 5 }));
      return;
    }
    if (eventsWithTickets.length > 0) {
      setError(t('cart.removeEventsWithTickets'));
      return;
    }
    if (needsWalletFields) {
      if (mobileMoneyCapabilityAvailable === false || mobileMoneyCapabilityAvailable === null) {
        return;
      }
      if (!isMobileMoneySelectionComplete(mobileMoneySelection)) {
        setError(t('cart.selectCountryOperatorMm', 'Select your country and mobile operator for Mobile Money.'));
        return;
      }
    }
    const checkoutPhone =
      phoneValue.localNumber.trim() !== ''
        ? formatFullPhone(phoneValue.dialCode, phoneValue.localNumber)
        : userProfile?.phone ?? null;
    const checkoutEmail = user?.email ?? undefined;
    setIsProcessing(true);
    setError(null);
    try {
      const res = await startMobileMoneyTicketCheckout({
        bundleType,
        bundleEventIds: items.map((item) => item.eventId),
        userId: user.id,
        email: checkoutEmail,
        phone: checkoutPhone || undefined,
        returnPath: cartReturnPath,
        ...(needsWalletFields ? mobileMoneyRoutingFields(mobileMoneySelection) : {}),
        ...paymentCountryFields({
          profileCountry: userProfile?.country,
          dialCode: phoneValue.dialCode,
          profilePhone: checkoutPhone ?? userProfile?.phone,
        }),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.url) window.location.href = res.url;
      else setError(t('cart.invalidPaymentResponse', 'Invalid response from payment service.'));
    } catch (err: any) {
      setError(err?.message || t('cart.pleaseTryAgain'));
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('cart.dateTba');
    try {
      return new Date(dateString).toLocaleDateString(i18n.language || 'en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return t('cart.dateTba');
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white pt-20 pb-20 px-4 relative overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        
        <div className="max-w-4xl mx-auto relative z-10">
          <Link
            to="/"
            className="inline-flex items-center text-purple-400 hover:text-purple-300 mb-8 transition-colors group"
          >
            <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
            {t('cart.continueShopping')}
          </Link>

          <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-3xl p-12 text-center border border-white/10 shadow-2xl">
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
              <ShoppingBag className="h-12 w-12 text-purple-400" />
            </div>
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">{t('cart.emptyCart')}</h2>
            <p className="text-gray-400 mb-8 text-lg">
              {t('cart.emptyCartDescription')}
            </p>
            <Link
              to="/"
              className="inline-block bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-700 hover:via-pink-700 hover:to-purple-700 text-white font-bold py-4 px-10 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-purple-500/50"
            >
              {t('cart.browseEvents')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white pt-20 pb-20 px-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
      <div className="max-w-4xl mx-auto relative z-10">
        <Link
          to="/"
          className="inline-flex items-center text-purple-400 hover:text-purple-300 mb-8 transition-colors group"
        >
          <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          {t('cart.continueShopping')}
        </Link>

        <h1 className="text-4xl md:text-5xl font-bold mb-8 bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
          {t('cart.shoppingCart')}
        </h1>

        {error && (
          <div className="bg-gradient-to-r from-red-600/20 via-red-500/20 to-red-600/20 backdrop-blur-sm border-2 border-red-500/50 text-red-300 px-6 py-4 rounded-2xl mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <p className="font-semibold">{error}</p>
            </div>
          </div>
        )}

        <div className="space-y-4 mb-8">
          {items.map((item) => {
            const eventDetail = eventDetails[item.eventId];
            const hasExistingTicket = eventsWithTickets.includes(item.eventId);
            return (
              <div
                key={item.eventId}
                className={`bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-2xl p-6 flex flex-col md:flex-row gap-6 border border-white/10 shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] ${
                  hasExistingTicket ? 'border-2 border-yellow-500/50 shadow-yellow-500/20' : ''
                }`}
              >
                <div className="flex-shrink-0">
                  {eventDetail?.image_url ? (
                    <img
                      src={eventDetail.image_url}
                      alt={item.eventTitle}
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-32 h-32 bg-gray-700 rounded-lg flex items-center justify-center">
                      <ShoppingBag className="h-12 w-12 text-gray-500" />
                    </div>
                  )}
                </div>

                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold">{item.eventTitle}</h3>
                    {hasExistingTicket && (
                      <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded-full">
                        {t('cart.alreadyPurchased')}
                      </span>
                    )}
                  </div>
                  {eventDetail && (
                    <p className="text-gray-400 text-sm mb-2">
                      {formatDate(eventDetail.start_time)}
                    </p>
                  )}
                  {hasExistingTicket && (
                    <p className="text-yellow-400 text-sm mb-2">
                      {t('cart.alreadyHaveTicketForEvent')}
                    </p>
                  )}
                  <p className="text-2xl font-bold text-purple-400">
                    ${item.price.toFixed(2)}
                  </p>
                </div>

                <div className="flex items-center">
                  <button
                    onClick={() => removeItem(item.eventId)}
                    className="p-3 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                    aria-label={t('cart.removeItem')}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-2xl p-8 mb-6 border border-white/10 shadow-2xl">
          {(() => {
            const subtotal = getTotalPrice();
            const serviceFee = subtotal * 0.05;
            const vat = subtotal * 0.2;
            const totalCharged = subtotal * 1.25;
            return (
              <>
                <div className="space-y-2 text-sm border-b border-white/10 pb-4 mb-4">
                  <div className="flex justify-between text-gray-300">
                    <span>{t('cart.subtotal')} ({items.length} {items.length === 1 ? t('cart.ticket') : t('cart.tickets')})</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>{t('cart.serviceFeePct')}</span>
                    <span>${serviceFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>{t('cart.vatPct')}</span>
                    <span>${vat.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-2xl font-bold text-gray-300">{t('cart.total')} ({t('cart.chargedAtCheckout')})</span>
                  <span className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    ${totalCharged.toFixed(2)}
                  </span>
                </div>
              </>
            );
          })()}
          
          {/* Contact info for guest users - email OR phone required */}
          {!user && (
            <div className="mb-6 space-y-4">
              <div>
                <label htmlFor="guest-email" className="block text-sm font-medium text-gray-300 mb-2">
                  {t('cart.emailAddress')} {!guestEmail && !phoneValue.localNumber.trim() && <span className="text-red-400">*</span>}
                  <span className="text-gray-500 text-xs ml-2">{t('cart.orUsePhoneBelow')}</span>
                </label>
                <input
                  id="guest-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setError(null);
                  }}
                  onBlur={() => {
                    if (emailInput && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
                      setGuestEmail(emailInput);
                      setShowEmailInput(false);
                    }
                  }}
                  placeholder="your.email@example.com"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div>
                <PhoneInput
                  label={`${t('cart.phoneNumber')} ${!guestEmail && !phoneValue.localNumber.trim() ? t('cart.requiredIfNoEmail') : ''}`}
                  value={phoneValue}
                  onChange={(val, fullPhone) => {
                    setPhoneValue(val);
                    setGuestPhone(fullPhone || null);
                  }}
                  placeholder={t('cart.forTicketAndUpdates')}
                  required={!guestEmail}
                />
              </div>
              <p className="text-xs text-gray-400">
                {t('cart.emailOrPhoneHint')}
              </p>
            </div>
          )}

          {/* Phone number for logged-in users (optional) */}
          {user && (
            <div className="mb-6">
              <PhoneInput
                label={t('cart.phoneNumberOptional', 'Phone number (optional)')}
                value={phoneValue}
                onChange={(val, fullPhone) => {
                  setPhoneValue(val);
                  setGuestPhone(fullPhone || null);
                }}
                placeholder={t('cart.forTicketAndUpdates')}
              />
            </div>
          )}
          
          {!user && guestEmail && !showEmailInput && (
            <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-400">{t('cart.emailLabelShort')}</p>
                  <p className="text-white font-medium">{guestEmail}</p>
                </div>
                <button
                  onClick={() => {
                    setShowEmailInput(true);
                    setEmailInput(guestEmail);
                  }}
                  className="text-purple-400 hover:text-purple-300 text-sm"
                >
                  {t('cart.change')}
                </button>
              </div>
            </div>
          )}

          {showMobileMoney && needsWalletFields && mmWalletExpanded ? (
            <div className="mb-6 p-4 rounded-xl bg-violet-950/30 border border-violet-500/25">
              <p className="text-sm font-medium text-violet-200 mb-3">
                {t('cart.mobileMoneyWallet', 'Mobile Money wallet')}
              </p>
              <MobileMoneyCountryOperatorFields
                value={mobileMoneySelection}
                onChange={setMobileMoneySelection}
                disabled={isProcessing}
                mobileMoneyIntent
                onCapabilitiesResolved={onMobileMoneyCapabilitiesResolved}
              />
            </div>
          ) : null}

          {/* Bundle offer when cart has exactly 3 or 5 items, user is signed in, and bundles are enabled */}
          {user && bundlesEnabled && (items.length === 3 || items.length === 5) && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-200">
                  {t('cart.saveWithBundle', { count: items.length })}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                {t('cart.payTotalInstead', { total: items.length === 3 ? '9.59' : '15.59', full: (getTotalPrice() * 1.25).toFixed(2), count: items.length })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleBundleCheckout(items.length === 3 ? '3_ticket' : '5_ticket')}
                  disabled={isProcessing}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  <CreditCard className="h-4 w-4" />
                  {isProcessing ? t('cart.processing') : t('cart.bundleCard', { price: items.length === 3 ? '9.59' : '15.59' })}
                </button>
                {showMobileMoney ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (needsWalletFields && !mmWalletExpanded) {
                        setMmWalletExpanded(true);
                        return;
                      }
                      setTimeout(
                        () => void handleMobileMoneyBundleCheckout(items.length === 3 ? '3_ticket' : '5_ticket'),
                        0,
                      );
                    }}
                    disabled={
                      isProcessing ||
                      (needsWalletFields &&
                        mmWalletExpanded &&
                        (mobileMoneyCapabilityAvailable === null ||
                          (mobileMoneyCapabilityAvailable === true &&
                            !isMobileMoneySelectionComplete(mobileMoneySelection))))
                    }
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-700 hover:bg-violet-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    <Smartphone className="h-4 w-4" />
                    {t('cart.payWithMobileMoney')}
                  </button>
                ) : null}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mb-4 leading-relaxed border border-white/10 rounded-lg px-3 py-2 bg-gray-900/40">
            {t('cart.checkoutBreakdownNote')}
          </p>
          
          <div className="space-y-3">
            <button
              onClick={handleCheckout}
              disabled={isProcessing || items.length === 0 || (!user && !guestEmail && !phoneValue.localNumber.trim())}
              className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-700 hover:via-pink-700 hover:to-purple-700 disabled:from-gray-600 disabled:via-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-purple-500/50 disabled:shadow-none"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  {t('cart.processing')}
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5 mr-2" />
                  {t('cart.payWithCard')}
                </>
              )}
            </button>
            {showMobileMoney ? (
              <button
                type="button"
                onClick={() => {
                  if (needsWalletFields && !mmWalletExpanded) {
                    setMmWalletExpanded(true);
                    return;
                  }
                  setTimeout(() => void handleMobileMoneyCheckout(), 0);
                }}
                disabled={
                  isProcessing ||
                  items.length === 0 ||
                  (!user && !guestEmail && !phoneValue.localNumber.trim()) ||
                  (needsWalletFields &&
                    mmWalletExpanded &&
                    (mobileMoneyCapabilityAvailable === null ||
                      (mobileMoneyCapabilityAvailable === true &&
                        !isMobileMoneySelectionComplete(mobileMoneySelection))))
                }
                className="w-full bg-violet-700 hover:bg-violet-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 flex items-center justify-center border border-violet-500/30"
              >
                <Smartphone className="h-5 w-5 mr-2" />
                {t('cart.payWithMobileMoney')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <MobileMoneyCountryModal
        open={mobileMoneyCountryModalOpen}
        onClose={() => setMobileMoneyCountryModalOpen(false)}
        eventPriceUsd={getTotalPrice()}
        onContinue={handleCartMmCountryContinue}
      />
    </div>
  );
};

export default Cart;


