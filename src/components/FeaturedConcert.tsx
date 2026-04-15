import React, { useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Concert, Artist } from '../types';
import { calculateTimeRemaining } from '../utils/formatters';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useCartStore } from '../store/useCartStore';
import { supabase } from '../lib/supabaseClient';
import { hasActiveTicket, extractFunctionError } from '../utils/ticketUtils';
import ShareButton from './ShareButton';
import FollowButton from './FollowButton';
import SmartImage from './SmartImage';

interface FeaturedConcertProps {
  concert: Concert;
  artist: Artist;
  onPrevious?: () => void;
  onNext?: () => void;
  showNavigation?: boolean;
}

const FeaturedConcert: React.FC<FeaturedConcertProps> = ({ 
  concert, 
  artist, 
  onPrevious, 
  onNext, 
  showNavigation = false 
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { user, userProfile } = useStore();
  const { addItem, isInCart, guestEmail } = useCartStore();
  const [eventStatus, setEventStatus] = useState<'upcoming' | 'live' | 'ended'>('upcoming');
  const [userHasTicket, setUserHasTicket] = useState<boolean | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00',
    isExpired: false
  });

  useEffect(() => {
    // Calculate event status based on current time
    const updateEventStatus = () => {
      const now = new Date();
      const eventStart = new Date(concert.date);
      const eventEnd = new Date(eventStart.getTime() + concert.duration * 60000);
      
      if (now < eventStart) {
        setEventStatus('upcoming');
      } else if (now >= eventStart && now <= eventEnd) {
        setEventStatus('live');
      } else {
        setEventStatus('ended');
      }
    };
    
    // Initial calculation
    updateEventStatus();
    setTimeRemaining(calculateTimeRemaining(concert.date, concert.time));

    // Update every second
    const timer = setInterval(() => {
      updateEventStatus();
      const remaining = calculateTimeRemaining(concert.date, concert.time);
      setTimeRemaining(remaining);
      
      // Clear interval if event has started
      if (remaining.isExpired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [concert.date, concert.time]);

  useEffect(() => {
    if (!concert.id) {
      setUserHasTicket(false);
      return;
    }
    const checkEmail = user?.email || guestEmail || null;
    const userId = user?.id || null;
    if (!userId && !checkEmail) {
      setUserHasTicket(false);
      return;
    }
    let cancelled = false;
    hasActiveTicket(concert.id, userId, checkEmail).then((has) => {
      if (!cancelled) setUserHasTicket(has);
    });
    return () => { cancelled = true; };
  }, [concert.id, user?.id, user?.email, guestEmail]);

  const handleWatchClick = () => {
    // Always navigate to watch page - let the Watch page handle access control
    // The Watch page will check for tickets and show appropriate UI based on event status
    navigate(`/watch/${concert.id}`);
  };

  const handleAddToCart = async () => {
    if (!concert.id) {
      alert(t('concertCard.eventMissing'));
      return;
    }

    if (isInCart(concert.id)) {
      alert(t('concertCard.alreadyInCart'));
      return;
    }

    // Check if user already has an active ticket for this event
    const checkEmail = user?.email || guestEmail;
    console.log('🛒 Add to cart - checking ticket:', { 
      eventId: concert.id, 
      userId: user?.id, 
      userEmail: user?.email,
      guestEmail: guestEmail,
      checkEmail: checkEmail
    });
    
    const hasTicket = await hasActiveTicket(concert.id, user?.id || null, checkEmail || null);
    console.log('🛒 Add to cart - has ticket result:', hasTicket);
    
    if (hasTicket) {
      alert(t('concertCard.alreadyHaveTicket'));
      return;
    }

    addItem({
      eventId: concert.id,
      eventTitle: concert.title,
      eventImage: concert.imageUrl,
      price: concert.price,
      artistName: artist.name,
      eventDate: concert.date,
    });

    alert(t('concertCard.eventAddedToCart'));
  };

  const handlePurchaseTicket = async () => {
    if (!concert.id) {
      alert(t('concertCard.eventMissing'));
      return;
    }

    // Check if user already has an active ticket for this event
    const checkEmail = user?.email || guestEmail;
    const hasTicket = await hasActiveTicket(concert.id, user?.id || null, checkEmail || null);
    if (hasTicket) {
      alert(t('concertCard.alreadyHaveTicket'));
      return;
    }

    try {
      // Use the create-checkout-session function that takes eventId
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventId: concert.id,
          email: user?.email || guestEmail || undefined,
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

      // Check if the response contains an error
      if (data.error) {
        alert(data.error);
        return;
      }

      // If URL is provided directly, use it
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // Otherwise, use sessionId with Stripe redirect
      if (data.sessionId) {
        const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
        if (!stripePublicKey) {
          alert(t('concertCard.paymentNotConfigured'));
          return;
        }

        // Load Stripe and redirect to checkout
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(stripePublicKey);

        if (!stripe) {
          alert(t('concertCard.failedToLoadPayment'));
          return;
        }

        // Redirect to Stripe Checkout
        const { error: redirectError } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        });

        if (redirectError) {
          alert(redirectError.message || t('concertCard.failedRedirect'));
        }
      } else {
        alert(t('concertCard.noCheckoutUrl'));
      }
    } catch (err) {
      console.error('Error purchasing ticket:', err);
      alert(err instanceof Error ? err.message : t('concertCard.unexpectedError'));
    }
  };

  return (
    <section className="relative h-[70vh] flex items-end overflow-hidden">
      <div className="absolute inset-0 z-0">
        <SmartImage
          src={concert.imageUrl}
          alt={concert.title}
          variant="hero"
          focalX={concert.focalX ?? 50}
          focalY={concert.focalY ?? 25}
          eager
          containerClassName="h-full w-full"
          className="absolute inset-0 w-full h-full"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-[1]" />
      
      {/* Navigation Controls */}
      {showNavigation && (
        <>
          <button
            onClick={onPrevious}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all duration-300 hover:scale-110 z-20"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all duration-300 hover:scale-110 z-20"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
      
      <div className="container mx-auto px-6 pb-16 relative z-10">
        {/* Make artist name clickable */}
        <Link
          to={`/artist/${artist.id}`}
          className="inline-block mb-4 hover:opacity-80 transition-opacity"
        >
          <span className={`text-white text-sm font-bold px-4 py-1 rounded-full flex items-center ${
            eventStatus === 'live' ? 'bg-red-600' : 
            eventStatus === 'upcoming' ? 'bg-yellow-600' : 
            'bg-gray-600'
          }`}>
            <span className="h-2 w-2 rounded-full bg-white animate-pulse mr-2"></span>
            {eventStatus === 'live' ? t('concertCard.liveNow') : 
             eventStatus === 'upcoming' ? t('concertCard.startingSoon', 'Starting Soon') : 
             t('concertCard.ended')}
          </span>
        </Link>
        <Link
          to={`/artist/${artist.id}`}
          className="block hover:opacity-90 transition-opacity"
        >
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-2 tracking-tight">
            {artist.name}
          </h1>
        </Link>
        
        <Link
          to={`/watch/${concert.id}`}
          className="block hover:opacity-90 transition-opacity"
        >
          <p className="text-2xl text-gray-200 mb-6">{concert.title}</p>
        </Link>
        
        <div className="flex space-x-2 mb-8">
          {artist.categories.map((category, index) => (
            <span key={index} className="bg-yellow-700 bg-opacity-60 text-white text-xs px-3 py-1 rounded-full">
              {category}
            </span>
          ))}
        </div>
        
        {!timeRemaining.isExpired && (
          <div className="flex items-center mb-8">
            <div className="flex space-x-2 text-3xl text-white font-mono">
              <div className="bg-yellow-900 bg-opacity-70 px-3 py-2 rounded-lg">{timeRemaining.days}</div>
              <span className="text-white self-center">:</span>
              <div className="bg-yellow-900 bg-opacity-70 px-3 py-2 rounded-lg">{timeRemaining.hours}</div>
              <span className="text-white self-center">:</span>
              <div className="bg-yellow-900 bg-opacity-70 px-3 py-2 rounded-lg">{timeRemaining.minutes}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-center">
          {/* Watch Button - Always available for all users (logged in or guest) */}
          <button 
            onClick={handleWatchClick}
            className="bg-gradient-to-r from-pink-500 to-yellow-600 hover:from-pink-600 hover:to-yellow-700 text-white font-bold py-3 px-8 rounded-full flex items-center transition-all duration-300 transform hover:scale-105 inline-flex"
          >
            <Play className="h-5 w-5 mr-2" />
            {t('concertCard.watchNow')}
          </button>
          {concert.price > 0 && !isInCart(concert.id) && (
            <button
              onClick={handleAddToCart}
              disabled={userHasTicket === true}
              title={userHasTicket ? t('concertCard.alreadyHaveTicket') : undefined}
              className={`font-bold py-3 px-8 rounded-full flex items-center transition-all duration-300 ${
                userHasTicket ? 'bg-gray-500 text-gray-300 cursor-not-allowed opacity-75' : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              {userHasTicket ? t('concertCard.haveTicket', 'You have a ticket') : t('concertCard.addToCart')}
            </button>
          )}
          <FollowButton artistId={artist.id} variant="default" />
          <ShareButton
            url={`/watch/${concert.id}`}
            title={concert.title}
            description={`${artist.name} - ${concert.title}`}
            imageUrl={concert.imageUrl}
            variant="button"
            className="ml-2"
          />
        </div>
      </div>
    </section>
  );
};

export default FeaturedConcert;