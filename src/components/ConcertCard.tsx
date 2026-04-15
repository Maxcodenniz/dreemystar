import React, { useState, useEffect } from 'react';
import { Calendar, Clock, CreditCard, Smartphone } from 'lucide-react';
import { Concert, Artist } from '../types';
import { formatDate, formatTime } from '../utils/formatters';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useCountdown from '../hooks/useCountdown';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { extractFunctionError, hasActiveTicket } from '../utils/ticketUtils';
import { useMobileMoneyCheckoutVisible } from '../contexts/MobileMoneyPaymentContext';
import { stashPawapayTicketCheckoutContext } from '../utils/pawapayCheckoutContext';
import ShareButton from './ShareButton';
import MobileMoneyCountryModal from './MobileMoneyCountryModal';
import SmartImage from './SmartImage';

interface ConcertCardProps {
  concert: Concert;
  artist: Artist;
}

const ConcertCard: React.FC<ConcertCardProps> = ({ concert, artist }) => {
  const { pathname } = useLocation();
  const { user } = useStore();
  const { t } = useTranslation();
  const showMobileMoney = useMobileMoneyCheckoutVisible();

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [mobileMoneyModalOpen, setMobileMoneyModalOpen] = useState(false);
  const [userHasTicket, setUserHasTicket] = useState<boolean | null>(null);
  const countdownTarget = `${concert.date}T${concert.time}`;
  const timeLeft = useCountdown(countdownTarget);

  useEffect(() => {
    if (!concert.id || !user?.id) {
      setUserHasTicket(false);
      return;
    }
    let cancelled = false;
    hasActiveTicket(concert.id, user.id, user.email || null).then((has) => {
      if (!cancelled) setUserHasTicket(has);
    });
    return () => { cancelled = true; };
  }, [concert.id, user?.id, user?.email]);

  const handlePayment = async () => {
    if (!concert.id) {
      alert(t('concertCard.eventMissing'));
      return;
    }

    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventId: concert.id,
          email: user?.email || undefined,
          returnPath: pathname,
        },
      });

      if (error) {
        console.error('Error creating checkout session:', error);
        const errorMessage = await extractFunctionError(error);
        alert(errorMessage);
        return;
      }

      if (!data) {
        alert(t('concertCard.invalidResponse'));
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
          alert(t('concertCard.stripeNotConfigured'));
          return;
        }

        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(stripePublicKey);
        
        if (!stripe) {
          alert(t('concertCard.failedToLoadStripe'));
          return;
        }

        const { error: redirectError } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        });

        if (redirectError) {
          alert(redirectError.message || t('concertCard.failedRedirect'));
        }
      } else {
        alert(t('concertCard.noCheckoutUrlGeneric'));
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      alert(error.message || t('concertCard.paymentUnavailable'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleMobileMoneyClick = () => {
    if (!concert.id) {
      alert(t('concertCard.eventMissing'));
      return;
    }
    setMobileMoneyModalOpen(true);
  };

  const handleMobileMoneyContinue = async (payload: {
    paymentCountryAlpha3: string;
    paymentCurrency: string;
    paymentAmount: string;
  }) => {
    if (!concert.id) return;
    const { data, error } = await supabase.functions.invoke('create-pawapay-payment', {
      body: {
        eventId: concert.id,
        email: user?.email || undefined,
        returnPath: pathname,
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
      throw new Error(t('concertCard.invalidResponse'));
    }
    const depositId = typeof data.deposit_id === 'string' ? data.deposit_id : undefined;
    if (depositId) {
      stashPawapayTicketCheckoutContext(depositId, {
        eventId: concert.id,
        returnPath: pathname,
        isCart: false,
      });
    }
    window.location.href = data.url as string;
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
      <div className="relative h-48 overflow-hidden">
        <SmartImage
          src={concert.imageUrl}
          alt={concert.title}
          variant="cardLandscape"
          focalX={concert.focalX ?? 50}
          focalY={concert.focalY ?? 25}
          containerClassName="h-full w-full"
          className="transition-transform duration-700 group-hover:scale-110"
        />
        {concert.isLive && (
          <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse mr-1"></span>
            {t('concertCard.live')}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          <div className="flex flex-wrap gap-2">
            {concert.categories.map((category, index) => (
              <span key={index} className="bg-yellow-700 bg-opacity-70 text-white text-xs px-2 py-0.5 rounded-full">
                {category}
              </span>
            ))}
          </div>
        </div>
      </div>
      
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="font-bold text-xl mb-1 text-gray-800">{concert.title}</h3>
            <p className="text-indigo-600 font-semibold mb-3">{artist.name}</p>
          </div>
          <ShareButton
            url={`/watch/${concert.id}`}
            title={concert.title}
            description={`${artist.name} - ${formatDate(concert.date)} at ${formatTime(concert.time)}`}
            imageUrl={concert.imageUrl}
            variant="icon"
            className="ml-2"
          />
        </div>
        
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            <span>{formatDate(concert.date)}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <Clock className="h-4 w-4 mr-2" />
            <span>{formatTime(concert.time)} • {concert.duration} {t('concertCard.mins')}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <span className="mr-2">$</span>
            <span>${concert.price.toFixed(2)}</span>
          </div>
        </div>

        {/* Countdown */}
        {!concert.isLive && (
          <div className="flex items-center justify-center space-x-2 mt-2 text-purple-800 font-semibold text-xl">
            {[
              { label: t('concertCard.days'), value: timeLeft.days },
              { label: t('concertCard.hours'), value: timeLeft.hours },
              { label: t('concertCard.minutes'), value: timeLeft.minutes }
            ].map((unit, index) => (
              <div key={unit.label} className="flex items-center space-x-1">
                <div className="flex flex-col items-center bg-white rounded-lg px-3 py-2 shadow-sm">
                  <span className="text-2xl font-bold">{unit.value.toString().padStart(2, '0')}</span>
                  <span className="text-xs uppercase text-gray-500">{unit.label}</span>
                </div>
                {index < 2 && <span className="text-purple-400 font-bold text-xl">:</span>}
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons — Mobile Money uses PawaPay Payment Page only (no country/operator/phone UI). */}
        <div className="space-y-2 mt-4">
          <button 
            onClick={handlePayment}
            disabled={isPurchasing || userHasTicket === true}
            className={`w-full font-bold py-2 px-4 rounded-lg transition-colors duration-300 flex items-center justify-center ${
              userHasTicket ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-75' : 'bg-gradient-to-r from-purple-600 to-yellow-600 hover:from-purple-700 hover:to-yellow-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {userHasTicket ? t('concertCard.haveTicket') : (isPurchasing ? t('concertCard.processing') : t('concertCard.payWithCard'))}
          </button>
          {showMobileMoney ? (
            <button
              type="button"
              onClick={handleMobileMoneyClick}
              disabled={userHasTicket === true}
              className={`w-full font-bold py-2 px-4 rounded-lg transition-colors duration-300 flex items-center justify-center ${
                userHasTicket ? 'bg-violet-900/50 text-violet-200 cursor-not-allowed opacity-75' : 'bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              {t('concertCard.payWithMobileMoney')}
            </button>
          ) : null}

          <Link 
            to={`/watch/${concert.id}`}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors duration-300 block text-center"
          >
            {t('concertCard.viewEventDetails')}
          </Link>
        </div>
      </div>

      <MobileMoneyCountryModal
        open={mobileMoneyModalOpen}
        onClose={() => setMobileMoneyModalOpen(false)}
        eventPriceUsd={concert.price}
        onContinue={handleMobileMoneyContinue}
      />
    </div>
  );
};

export default ConcertCard;
