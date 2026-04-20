import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { useCartStore } from '../store/useCartStore';
import FeaturedConcert from '../components/FeaturedConcert';
import UpcomingConcerts from '../components/UpcomingConcerts';
import ArtistsSection from '../components/ArtistsSection';
import { Concert, Artist } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchEventsMergedWithRetry } from '../utils/eventsFetch';
import { formatSupabaseQueryError } from '../utils/formatSupabaseQueryError';
import { devLogBackendFailure, devLogSupabaseNotConfiguredOnce } from '../utils/devBackendLog';
import { CheckCircle, X, Ticket, Sparkles, AlertCircle } from 'lucide-react';
import ArtistSurveyModal from '../components/ArtistSurveyModal';

const Home: React.FC = () => {
  const { t } = useTranslation();
  const { userProfile, user } = useStore();
  const { clearCart } = useCartStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentMessageKey, setPaymentMessageKey] = useState<'paymentMessageCart' | 'paymentMessageSingle' | 'paymentMessageGeneric'>('paymentMessageGeneric');
  const [advertisementsEnabled, setAdvertisementsEnabled] = useState(true);
  const [artistApplicationEnabled, setArtistApplicationEnabled] = useState(true);
  const [showInitialSurvey, setShowInitialSurvey] = useState(false);
  const [showWishlistSurvey, setShowWishlistSurvey] = useState(false);
  const [surveyPopupDays, setSurveyPopupDays] = useState<number>(30);
  const [eventsFetchError, setEventsFetchError] = useState<string | null>(null);
  const eventsFetchGen = useRef(0);

  // Filter events (shared logic for featured and full fetch)
  const filterValidEvents = (data: any[] | null, isAdmin: boolean) => {
    const now = new Date();
    // Include artist_id even when profiles failed to load (timeouts, RLS, or batch errors)
    let valid = (data || []).filter(
      (event: any) =>
        event.profiles != null ||
        event.unregistered_artist_name ||
        event.artist_id
    );
    valid = valid.filter((e: any) => e.status !== 'ended');
    if (!isAdmin) {
      valid = valid.filter((event: any) => {
        const eventStart = new Date(event.start_time);
        const eventEnd = new Date(eventStart.getTime() + event.duration * 60000);
        return now <= eventEnd && event.status !== 'ended';
      });
    }
    return valid;
  };

  useEffect(() => {
    const gen = ++eventsFetchGen.current;
    const isAdmin = userProfile?.user_type === 'global_admin';

    // Single full fetch so Upcoming Concerts and hero both get the complete list (avoids "only one event at first" bug)
    const fetchAllEvents = async () => {
      if (!isSupabaseConfigured) {
        devLogSupabaseNotConfiguredOnce();
        if (gen === eventsFetchGen.current) {
          setEventsFetchError(formatSupabaseQueryError(new Error('Service unavailable')));
          setLoading(false);
        }
        return;
      }
      try {
        const data = await fetchEventsMergedWithRetry(supabase);
        const valid = filterValidEvents(data, !!isAdmin);
        if (gen === eventsFetchGen.current) {
          setEvents(valid);
          setEventsFetchError(null);
        }
      } catch (error) {
        if (gen === eventsFetchGen.current) {
          devLogBackendFailure('Home.fetchAllEvents', error);
          setEventsFetchError(formatSupabaseQueryError(error));
        }
      } finally {
        if (gen === eventsFetchGen.current) setLoading(false);
      }
    };

    fetchAllEvents();
    fetchAdvertisementConfig();
    fetchArtistApplicationConfig();
    // Fetch popup survey frequency
    const fetchSurveyPopupConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'artist_survey_popup_days')
          .maybeSingle();
        if (!error && data) {
          const val =
            typeof data.value === 'number'
              ? data.value
              : parseInt(String(data.value), 10);
          if (Number.isFinite(val) && val > 0) {
            setSurveyPopupDays(val);
          }
        }
      } catch (err) {
        console.error('Error fetching artist_survey_popup_days config:', err);
        setSurveyPopupDays(30);
      }
    };

    fetchSurveyPopupConfig();

    // Refresh event data every 30 seconds to update live status
    const refreshInterval = setInterval(() => {
      fetchEvents();
    }, 30000);

    // Listen for platform refresh event
    const handlePlatformRefresh = () => {
      console.log('🔄 Platform refresh triggered - refreshing home page data');
      fetchEvents();
      fetchAdvertisementConfig();
      fetchArtistApplicationConfig();
    };

    window.addEventListener('platformRefresh', handlePlatformRefresh);

    return () => {
      eventsFetchGen.current++;
      clearInterval(refreshInterval);
      window.removeEventListener('platformRefresh', handlePlatformRefresh);
    };
  }, []);

  // Initial favorites survey: show once after account confirmation/first login
  useEffect(() => {
    if (!userProfile || !user) return;
    try {
      const key = `survey_initial_completed_${userProfile.id}`;
      if (window.localStorage.getItem(key) === '1') {
        return;
      }
      const profileAny: any = userProfile;
      if (profileAny.survey_initial_completed || (Array.isArray(profileAny.favorite_artists) && profileAny.favorite_artists.length > 0)) {
        window.localStorage.setItem(key, '1');
        return;
      }
      // Only ask fans at the moment (marketing focus)
      if (userProfile.user_type === 'fan') {
        setShowInitialSurvey(true);
      }
    } catch {
      // If localStorage is not available, still try to show once per session
      if (userProfile.user_type === 'fan') {
        setShowInitialSurvey(true);
      }
    }
  }, [userProfile, user]);

  // Wishlist survey popup: ask fans occasionally who they want to see online
  useEffect(() => {
    if (!userProfile || !user || userProfile.user_type !== 'fan') return;
    let timeout: number | undefined;
    try {
      const key = `survey_wishlist_last_shown_${userProfile.id}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const last = parseInt(raw, 10);
        const intervalMs = (surveyPopupDays || 30) * 24 * 60 * 60 * 1000;
        if (!Number.isNaN(last) && Date.now() - last < intervalMs) {
          return;
        }
      }
      // Show after a short delay so it doesn't clash with other popups
      timeout = window.setTimeout(() => {
        setShowWishlistSurvey(true);
      }, 20000);
    } catch {
      // Fallback: show once for this session after delay
      timeout = window.setTimeout(() => {
        setShowWishlistSurvey(true);
      }, 20000);
    }
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [userProfile, user, surveyPopupDays]);

  const fetchAdvertisementConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'advertisements_home_enabled')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
        console.error('Error fetching advertisement config:', error);
        return;
      }

      // Default to true if config doesn't exist
      const isEnabled = data?.value === true || data?.value === 'true' || data === null;
      setAdvertisementsEnabled(isEnabled);
    } catch (err) {
      console.error('Error fetching advertisement config:', err);
      // Default to enabled on error
      setAdvertisementsEnabled(true);
    }
  };

  const fetchArtistApplicationConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'artist_application_enabled')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching artist application config:', error);
        return;
      }

      const isEnabled = data?.value === true || data?.value === 'true' || data === null;
      setArtistApplicationEnabled(isEnabled);
    } catch (err) {
      console.error('Error fetching artist application config:', err);
      setArtistApplicationEnabled(true);
    }
  };

  // Check for payment success in URL parameters
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment');
    const isCartPurchase = searchParams.get('cart') === 'true';
    const eventId = searchParams.get('eventId');

    if (paymentSuccess === 'success') {
      // Clear cart as a safeguard (in case TicketConfirmation didn't run)
      if (isCartPurchase) {
        try {
          clearCart();
          console.log('✅ Cart cleared on Home page (safeguard)');
        } catch (e) {
          console.warn('⚠️ Could not clear cart on Home (storage may be restricted):', e);
        }
      }

      if (isCartPurchase) {
        setPaymentMessageKey('paymentMessageCart');
      } else if (eventId) {
        setPaymentMessageKey('paymentMessageSingle');
      } else {
        setPaymentMessageKey('paymentMessageGeneric');
      }

      setShowPaymentSuccess(true);

      // Clear URL parameters after showing notification
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('payment');
      newSearchParams.delete('cart');
      newSearchParams.delete('eventId');
      newSearchParams.delete('session_id');
      newSearchParams.delete('email');
      newSearchParams.delete('provider');
      newSearchParams.delete('tx_ref');

      // Update URL without the payment parameters
      navigate(`/?${newSearchParams.toString()}`, { replace: true });

      // Auto-hide notification after 8 seconds
      const timer = setTimeout(() => {
        setShowPaymentSuccess(false);
      }, 8000);

      return () => clearTimeout(timer);
    }
  }, [searchParams, navigate]);

  // Separate effect for auto-advance slideshow
  useEffect(() => {
    if (events.length > 1) {
      const interval = setInterval(() => {
        setCurrentEventIndex((prevIndex) => (prevIndex + 1) % events.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [events.length]);

  const fetchEvents = async () => {
    if (!isSupabaseConfigured) {
      devLogSupabaseNotConfiguredOnce();
      setEventsFetchError(formatSupabaseQueryError(new Error('Service unavailable')));
      setLoading(false);
      return;
    }
    const isAdmin = userProfile?.user_type === 'global_admin';
    try {
      const data = await fetchEventsMergedWithRetry(supabase);
      const valid = filterValidEvents(data, !!isAdmin);
      setEvents(valid);
      setEventsFetchError(null);
    } catch (error) {
      devLogBackendFailure('Home.fetchEvents', error);
      setEventsFetchError(formatSupabaseQueryError(error));
    } finally {
      setLoading(false);
    }
  };

  const retryEventsLoad = async () => {
    if (!isSupabaseConfigured) {
      devLogSupabaseNotConfiguredOnce();
      setEventsFetchError(formatSupabaseQueryError(new Error('Service unavailable')));
      return;
    }
    const isAdmin = userProfile?.user_type === 'global_admin';
    setLoading(true);
    setEventsFetchError(null);
    try {
      const data = await fetchEventsMergedWithRetry(supabase);
      const valid = filterValidEvents(data, !!isAdmin);
      setEvents(valid);
    } catch (error) {
      devLogBackendFailure('Home.retryEventsLoad', error);
      setEventsFetchError(formatSupabaseQueryError(error));
    } finally {
      setLoading(false);
    }
  };

  const goToPrevious = () => {
    setCurrentEventIndex((prevIndex) => 
      prevIndex === 0 ? events.length - 1 : prevIndex - 1
    );
  };

  const goToNext = () => {
    setCurrentEventIndex((prevIndex) => (prevIndex + 1) % events.length);
  };

  const currentEvent = events[currentEventIndex];

  // Preload featured hero image for faster paint
  useEffect(() => {
    const url = currentEvent?.image_url || null;
    if (!url || url.startsWith('data:')) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [currentEvent?.id, currentEvent?.image_url]);

  // Transform events data into Concert type
  const concerts: Concert[] = events.map(event => ({
    id: event.id,
    artistId: event.artist_id || event.id,
    title: event.title,
    date: event.start_time,
    time: new Date(event.start_time).toLocaleTimeString(),
    imageUrl: event.image_url || 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg',
    description: event.description,
    categories: event.profiles?.genres || [event.artist_type || 'Music'],
    duration: event.duration,
    isLive: event.status === 'live',
    price: event.price,
    maxTickets: 1000,
    soldTickets: 0,
    streamUrl: event.stream_url,
    focalX: event.image_focal_x ?? null,
    focalY: event.image_focal_y ?? null,
  }));

  // Transform profiles data into Artist type
  const artists: Artist[] = events
    .map(event => {
      if (event.profiles) {
        return {
          id: event.profiles.id,
          name: event.profiles.username || 'Unknown Artist', // Only show username to fans (full_name is confidential)
          imageUrl: event.profiles.avatar_url || 'https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg',
          genre: event.profiles.genres?.[0] || 'Various',
          categories: [
            event.profiles.artist_type === 'music' ? 'Music' : 'Comedy',
            ...(event.profiles.genres || [])
          ],
          bio: '',
          socialLinks: {}
        };
      }
      if (event.unregistered_artist_name) {
        return {
          id: event.id, // Use event ID as artist ID for unregistered artists
          name: event.unregistered_artist_name,
          imageUrl: 'https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg',
          genre: event.artist_type || 'Various',
          categories: [event.artist_type === 'music' ? 'Music' : 'Comedy'],
          bio: '',
          socialLinks: {}
        };
      }
      if (event.artist_id) {
        return {
          id: event.artist_id,
          name: t('home.artistDisplayFallback'),
          imageUrl: 'https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg',
          genre: event.artist_type || 'Various',
          categories: [event.artist_type === 'music' ? 'Music' : 'Comedy'],
          bio: '',
          socialLinks: {}
        };
      }
      return null;
    })
    .filter((artist): artist is Artist => artist !== null);

  // Filter upcoming concerts (not live or ended) - only show scheduled/upcoming events
  const upcomingConcerts = concerts.filter(concert => {
    // Exclude live and ended events
    if (concert.isLive) return false;
    
    // Check if the event has ended based on status
    const event = events.find(e => e.id === concert.id);
    if (event && event.status === 'ended') return false;
    
    // Also check if event time has passed
    const eventStart = new Date(concert.date);
    const eventEnd = new Date(eventStart.getTime() + concert.duration * 60000);
    const now = new Date();
    
    // Only show events that haven't ended yet
    return now <= eventEnd;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950">
        <div className="h-[70vh] flex flex-col items-center justify-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500/30 border-t-purple-500"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 border-2 border-purple-500/20"></div>
          </div>
          <p className="mt-6 text-gray-400 font-medium">{t('home.loadingEvents')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 relative overflow-hidden">
      {eventsFetchError && (
        <div className="relative z-20 container mx-auto px-4 sm:px-6 pt-4">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-50">{t('home.eventsLoadErrorTitle')}</p>
              <p className="mt-1 text-amber-100/90 break-words">{eventsFetchError}</p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void retryEventsLoad()}
                className="rounded-lg px-3 py-1 font-medium text-amber-950 bg-amber-400/90 hover:bg-amber-300"
              >
                {t('home.retry')}
              </button>
              <button
                type="button"
                onClick={() => setEventsFetchError(null)}
                className="rounded-lg px-2 py-1 text-amber-200 hover:bg-white/10"
              >
                {t('home.dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl"></div>
      </div>
      {/* Payment Success Notification - Enhanced */}
      {showPaymentSuccess && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
          <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 text-white px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[400px] max-w-[600px] border-2 border-green-400/50 backdrop-blur-xl">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center border border-white/30">
              <CheckCircle className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Ticket className="w-5 h-5" />
                <h3 className="font-bold text-lg">{t('home.paymentSuccess')}</h3>
              </div>
              <p className="text-sm text-green-50">{t(`home.${paymentMessageKey}`)}</p>
            </div>
            <button
              onClick={() => setShowPaymentSuccess(false)}
              className="flex-shrink-0 w-9 h-9 rounded-xl hover:bg-white/20 border border-white/20 transition-all duration-300 flex items-center justify-center group"
              aria-label="Close notification"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </div>
      )}

      {currentEvent && (
        <FeaturedConcert 
          concert={{
            id: currentEvent.id,
            artistId: currentEvent.artist_id || currentEvent.id,
            title: currentEvent.title,
            date: currentEvent.start_time,
            time: new Date(currentEvent.start_time).toLocaleTimeString(),
            imageUrl: currentEvent.image_url || 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg',
            description: currentEvent.description,
            categories: currentEvent.profiles?.genres || [currentEvent.artist_type || 'Music'],
            duration: currentEvent.duration,
            isLive: currentEvent.status === 'live',
            price: currentEvent.price,
            maxTickets: 1000,
            soldTickets: 0,
            streamUrl: currentEvent.stream_url
          }}
          artist={{
            id: currentEvent.artist_id || currentEvent.id,
            name: currentEvent.profiles?.username || currentEvent.unregistered_artist_name || 'Unknown Artist', // Only show username to fans (full_name is confidential)
            imageUrl: currentEvent.profiles?.avatar_url || 'https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg',
            genre: currentEvent.profiles?.genres?.[0] || currentEvent.artist_type || 'Music',
            categories: [
              currentEvent.profiles?.artist_type === 'music' || currentEvent.artist_type === 'music' ? 'Music' : 'Comedy',
              ...(currentEvent.profiles?.genres || [])
            ],
            bio: '',
            socialLinks: {}
          }}
          onPrevious={goToPrevious}
          onNext={goToNext}
          showNavigation={events.length > 1}
        />
      )}
      
      <UpcomingConcerts 
        concerts={upcomingConcerts}
        artists={artists}
        showAdvertisements={advertisementsEnabled}
      />
      
      {/* Artist Application CTA — animated when user is not logged in */}
      {artistApplicationEnabled && (
        <div className="container mx-auto px-4 sm:px-6 py-12">
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900/40 via-pink-900/30 to-purple-900/40 border border-purple-500/20 p-8 sm:p-10 ${!user ? 'animate-artist-cta' : ''}`}>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM5ZjdmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTRWMjhIMjR2Mmgxem0tMTItNmgydi0ySDI0djJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  {t('home.areYouArtistTitle')}
                </h3>
                <p className="text-gray-300 max-w-lg">
                  {t('home.artistCtaDescription')}
                </p>
              </div>
              <Link
                to="/artist-application"
                onClick={() => window.scrollTo(0, 0)}
                className="flex-shrink-0 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold text-lg transition-all duration-300 shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-105 flex items-center space-x-2"
              >
                <Sparkles className="w-5 h-5" />
                <span>{t('home.applyNow')}</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      <ArtistsSection searchQuery="" />

      {/* Artist surveys */}
      {showInitialSurvey && (
        <ArtistSurveyModal
          mode="initial"
          onCompleted={() => setShowInitialSurvey(false)}
          onClose={() => setShowInitialSurvey(false)}
        />
      )}
      {showWishlistSurvey && !showInitialSurvey && (
        <ArtistSurveyModal
          mode="popup"
          onCompleted={() => setShowWishlistSurvey(false)}
          onClose={() => setShowWishlistSurvey(false)}
        />
      )}
    </div>
  );
};

export default Home;