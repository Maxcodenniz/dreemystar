import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useStreaming } from '../contexts/StreamingContext';
import AgoraPlayer from '../components/AgoraPlayer';
import { generateToken } from '../lib/agoraClient';
import { Users, Volume2, VolumeX, Play, Pause, X, Maximize, Minimize, Settings, Heart, Calendar, User, ArrowLeft, CreditCard, Smartphone, ShoppingCart, Monitor, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useCartStore } from '../store/useCartStore';
import { hasActiveTicket, getReplayAccess, extractFunctionError } from '../utils/ticketUtils';
import { Ticket } from 'lucide-react';
import ShareButton from '../components/ShareButton';
import FollowButton from '../components/FollowButton';
import SendTipButton from '../components/SendTipButton';
import AddToCalendarButton from '../components/AddToCalendarButton';
import { SimpleVideoPlayer } from '../components/VideoPlayer';
import { getStoredDeviceId } from '../utils/deviceFingerprint';
import { appConfigValueEnabled } from '../utils/appConfigBoolean';
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
import { useViewerPresence, broadcastLike } from '../hooks/useViewerPresence';

type EventRecord = {
  id: string;
  title: string;
  status: string;
  start_time: string | null;
  duration?: number | null;
  price?: number | null;
  replay_price?: number | null;
  image_url?: string | null;
  video_url?: string | null;
  viewer_count?: number | null;
  like_count?: number | null;
  description?: string | null;
  artist_id?: string | null;
  unregistered_artist_name?: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
  /** Server-set when the event first enters live status (broadcast start). */
  live_started_at?: string | null;
  profiles?: { username?: string | null; full_name?: string | null; id?: string | null } | null;
};

/** Formats seconds since broadcast start as H:MM:SS or M:SS for the live elapsed badge. */
function formatLiveElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const Watch: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname: checkoutReturnPath } = useLocation();
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const {
    setIsStreaming,
    setVideoElement,
    setStreamTitle,
    setIsViewerStream,
    setWatchUrl,
    setStreamingClient,
  } = useStreaming();
  const { userProfile, user } = useStore();
  const { guestEmail, addItem, isInCart } = useCartStore();
  const showMobileMoney = useMobileMoneyCheckoutVisible();
  const needsWalletFields = useMobileMoneyNeedsWalletFields();
  const { pawapayEnabled } = useMobileMoneyPayments();
  const [mobileMoneySelection, setMobileMoneySelection] = useState<MobileMoneySelection>({
    countryCode: '',
    mobileOperator: '',
  });
  const [mobileMoneyCapabilityAvailable, setMobileMoneyCapabilityAvailable] = useState<boolean | null>(null);
  const [mmWalletExpanded, setMmWalletExpanded] = useState(false);
  const [mmCountryModalOpen, setMmCountryModalOpen] = useState(false);
  const [mmModalMode, setMmModalMode] = useState<'ticket' | 'replay' | null>(null);
  const onMobileMoneyCapabilitiesResolved = useCallback((detail: { available: boolean }) => {
    setMobileMoneyCapabilityAvailable(detail.available);
  }, []);

  useEffect(() => {
    if (!showMobileMoney) {
      setMmWalletExpanded(false);
      setMobileMoneyCapabilityAvailable(null);
    }
  }, [showMobileMoney]);

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isViewerActive, setIsViewerActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoQuality, setVideoQuality] = useState<string>('auto');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [accessChecking, setAccessChecking] = useState(false);
  const [hasTicket, setHasTicket] = useState<boolean>(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [replayAccess, setReplayAccess] = useState<{ canWatch: boolean; reason: 'free' | 'replay_ticket' | null } | null>(null);
  const [replayAccessChecking, setReplayAccessChecking] = useState(false);
  const [bundleCreditsTotal, setBundleCreditsTotal] = useState(0);
  const [bundlesEnabled, setBundlesEnabled] = useState(true);
  const [replaysEnabled, setReplaysEnabled] = useState(true);
  const [liveReplayBundleEnabled, setLiveReplayBundleEnabled] = useState(true);
  const [liveElapsedSec, setLiveElapsedSec] = useState(0);

  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const videoPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number | null>(null);

  // Stable device ID for viewer presence
  const stableDeviceId = useRef<string | null>(null);
  if (!stableDeviceId.current) {
    try {
      stableDeviceId.current = getStoredDeviceId();
    } catch (_) {
      stableDeviceId.current = crypto.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  // Join presence as soon as the fan is allowed on the live watch page — not
  // only after Agora RTC connects. Otherwise the broadcaster meta channel gets
  // no shard_count reports until join completes (often several seconds / never
  // if autoplay blocks), so the studio shows 0 viewers.
  const watchPresenceEnabled = useMemo(() => {
    if (!event?.id || !channelName || hasAccess !== true || accessChecking) {
      return false;
    }
    const isEventOver =
      event.status === 'ended' ||
      (!!event.start_time &&
        (event.duration ?? 0) > 0 &&
        new Date(event.start_time).getTime() + (event.duration ?? 0) * 60 * 1000 < Date.now());
    return event.status === 'live' && !isEventOver;
  }, [event, channelName, hasAccess, accessChecking]);

  // Scalable viewer presence: uses Supabase Realtime Presence instead of
  // per-viewer DB heartbeats. Zero DB writes for counting; single-device
  // enforcement fires only on the initial join upsert.
  const {
    viewerCount,
    likeCount,
    isKicked: sessionKicked,
  } = useViewerPresence({
    eventId: watchPresenceEnabled ? event.id : undefined,
    userId: user?.id ?? null,
    deviceId: stableDeviceId.current,
    enabled: watchPresenceEnabled,
  });

  // While on the live watch surface, counts come from Presence + meta broadcast.
  const displayViewerCount = watchPresenceEnabled ? viewerCount : (event?.viewer_count ?? 0);
  const displayLikeCount = watchPresenceEnabled ? likeCount : (event?.like_count ?? 0);

  // Elapsed time since official broadcast start (live_started_at from DB)
  useEffect(() => {
    if (!event?.live_started_at || event.status !== 'live') {
      setLiveElapsedSec(0);
      return;
    }
    const plannedEndPassed =
      !!event.start_time &&
      (event.duration ?? 0) > 0 &&
      new Date(event.start_time).getTime() + (event.duration ?? 0) * 60 * 1000 < Date.now();
    if (plannedEndPassed) {
      setLiveElapsedSec(0);
      return;
    }
    const startMs = new Date(event.live_started_at).getTime();
    const tick = () => {
      setLiveElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [event?.id, event?.status, event?.live_started_at, event?.start_time, event?.duration]);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobileUA = mobileRegex.test(userAgent.toLowerCase());
      const isMobileWidth = window.innerWidth < 768;
      setIsMobile(isMobileUA || isMobileWidth);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-hide controls on mobile after 3 seconds
  useEffect(() => {
    if (isMobile && event?.status === 'live' && channelName) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      if (showControls) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }

      return () => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      };
    }
  }, [isMobile, showControls, event?.status, channelName]);

  // Fetch event
  useEffect(() => {
    if (!id) return;

    const fetchEvent = async () => {
      try {
        setLoading(true);
        const { data, error: eventError } = await supabase
          .from('events')
          .select(
            `
              id,
              title,
              status,
              start_time,
              duration,
              price,
              replay_price,
              image_url,
              image_focal_x,
              image_focal_y,
              video_url,
              viewer_count,
              like_count,
              live_started_at,
              description,
              artist_id,
              unregistered_artist_name,
              profiles:artist_id ( id, username, full_name )
            `
          )
          .eq('id', id)
          .maybeSingle();

        if (eventError) throw eventError;
        if (!data) throw new Error('Event not found');

        setEvent(data as EventRecord);
        setChannelName(`event_${data.id}`);
      } catch (err: any) {
        console.error('Failed to fetch event:', err);
        setError(err?.message || 'Failed to load event');
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [id]);

  // Check access for live stream: admins can always watch; others need an active ticket.
  // Only re-run when access-relevant inputs change — NOT when event is updated from realtime
  // (viewer_count, like_count), so we don't unmount the player and exit fullscreen.
  const eventId = event?.id ?? null;
  const eventStatus = event?.status ?? null;
  const eventStartTime = event?.start_time ?? null;
  const eventDuration = event?.duration ?? null;

  useEffect(() => {
    if (!event || !id) {
      setHasAccess(null);
      setAccessChecking(false);
      return;
    }
    const isEventOver =
      event.status === 'ended' ||
      (event.start_time &&
        (event.duration ?? 0) > 0 &&
        new Date(event.start_time).getTime() + (event.duration ?? 0) * 60 * 1000 < Date.now());
    const isLive = event.status === 'live' && !isEventOver;

    if (!isLive) {
      setHasAccess(null);
      setAccessChecking(false);
      return;
    }

    let cancelled = false;
    setAccessChecking(true);
    setHasAccess(null);

    const checkAccess = async () => {
      const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
      if (isAdmin) {
        if (!cancelled) {
          setHasAccess(true);
          setAccessChecking(false);
        }
        return;
      }
      const checkEmail = user?.email || guestEmail || null;
      const hasTicket = await hasActiveTicket(id!, user?.id || null, checkEmail);
      if (!cancelled) {
        setHasAccess(hasTicket);
        setAccessChecking(false);
      }
    };

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [id, eventId, eventStatus, eventStartTime, eventDuration, user?.id, user?.email, userProfile?.user_type, guestEmail]);

  // Check if user has active ticket for non-live events
  useEffect(() => {
    if (!event) return;
    
    // Calculate isLive and isEventOver inside useEffect
    const isEventOver =
      event.status === 'ended' ||
      (event.start_time &&
        (event.duration ?? 0) > 0 &&
        new Date(event.start_time).getTime() + (event.duration ?? 0) * 60 * 1000 < Date.now());
    const isLive = event.status === 'live' && !isEventOver;
    
    // Skip check for live events (handled by hasAccess)
    if (isLive) return;
    
    const checkTicket = async () => {
      if (!user && !guestEmail) {
        setHasTicket(false);
        return;
      }
      const checkEmail = user?.email || guestEmail;
      const ticketStatus = await hasActiveTicket(event.id, user?.id || null, checkEmail || null);
      setHasTicket(ticketStatus);
    };
    checkTicket();
  }, [event?.id, event?.status, event?.start_time, event?.duration, user?.id, user?.email, guestEmail]);

  // Bundle credits (for "Use 1 credit" option when buying live tickets)
  useEffect(() => {
    if (!user?.id) {
      setBundleCreditsTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_bundle_credits')
        .select('credits_remaining')
        .eq('user_id', user.id)
        .gt('credits_remaining', 0);
      if (cancelled || error) {
        if (!cancelled) setBundleCreditsTotal(0);
        return;
      }
      const total = (data ?? []).reduce((sum: number, row: { credits_remaining?: number }) => sum + (row.credits_remaining ?? 0), 0);
      if (!cancelled) setBundleCreditsTotal(total);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const fetchBundlesEnabled = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'bundles_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setBundlesEnabled(appConfigValueEnabled(data.value, true));
        }
      } catch {
        setBundlesEnabled(true);
      }
    };
    fetchBundlesEnabled();
  }, []);

  useEffect(() => {
    const fetchReplaysEnabled = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'replays_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setReplaysEnabled(appConfigValueEnabled(data.value, true));
        }
      } catch {
        setReplaysEnabled(true);
      }
    };
    fetchReplaysEnabled();
  }, []);

  useEffect(() => {
    const fetchLiveReplayBundle = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'live_replay_bundle_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setLiveReplayBundleEnabled(appConfigValueEnabled(data.value, true));
        }
      } catch {
        setLiveReplayBundleEnabled(true);
      }
    };
    fetchLiveReplayBundle();
  }, []);

  // Replay access: free for 3h after event end (with live ticket) or with replay ticket
  useEffect(() => {
    if (!event?.video_url || !event.start_time || (event.duration ?? 0) <= 0) {
      setReplayAccess(null);
      setReplayAccessChecking(false);
      return;
    }
    const isEventOver =
      event.status === 'ended' ||
      (event.start_time &&
        (event.duration ?? 0) > 0 &&
        new Date(event.start_time).getTime() + (event.duration ?? 0) * 60 * 1000 < Date.now());
    if (!isEventOver) {
      setReplayAccess(null);
      setReplayAccessChecking(false);
      return;
    }
    let cancelled = false;
    setReplayAccessChecking(true);
    getReplayAccess(
      event.id,
      user?.id || null,
      user?.email || guestEmail || null,
      event.start_time,
      event.duration ?? 0
    ).then((access) => {
      if (!cancelled) {
        setReplayAccess(access);
        setReplayAccessChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, [event?.id, event?.video_url, event?.status, event?.start_time, event?.duration, user?.id, user?.email, guestEmail]);

  // Subscribe to event status changes only (live → ended, etc.).
  // Viewer count and like count are now sourced from Presence/broadcast,
  // NOT from the events table — this eliminates the Realtime broadcast
  // storm that occurred when every heartbeat updated events.viewer_count.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`event-status-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${id}` },
        (payload: any) => {
          const updated = payload.new as EventRecord;
          setEvent((prev) => {
            if (!prev) return updated;
            // Only merge status/structural fields; counts come from Presence
            return {
              ...prev,
              status: updated.status ?? prev.status,
              video_url: updated.video_url ?? prev.video_url,
              start_time: updated.start_time ?? prev.start_time,
              duration: updated.duration ?? prev.duration,
              price: updated.price ?? prev.price,
              replay_price: updated.replay_price ?? prev.replay_price,
              image_url: updated.image_url ?? prev.image_url,
              description: updated.description ?? prev.description,
              live_started_at:
                updated.live_started_at !== undefined ? updated.live_started_at : prev.live_started_at,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Keep streaming context updated
  useEffect(() => {
    if (!event) return;
    setStreamTitle(event.title);
    setWatchUrl(`/watch/${event.id}`);
  }, [event, setStreamTitle, setWatchUrl]);

  const handleViewerJoin = async () => {
    setIsViewerActive(true);
    setIsViewerStream(true);
    setIsStreaming(true);
    if (videoContainerRef.current) {
      setVideoElement(videoContainerRef.current);
    }
    // The useViewerPresence hook handles: Presence join, single-device
    // enforcement (one DB upsert), and count tracking — no heartbeats needed.
  };

  const handleViewerLeave = async () => {
    setIsViewerActive(false);
    setIsViewerStream(false);
    setIsStreaming(false);
    setVideoElement(null);
    // useViewerPresence cleanup handles: Presence leave, DB session deactivation
  };

  const triggerLike = async () => {
    if (!event) return;
    setShowLikeBurst(true);
    setTimeout(() => setShowLikeBurst(false), 500);

    try {
      // broadcastLike sends a Presence-channel broadcast (instant for all
      // viewers) and then persists via the secured RPC (one DB write).
      await broadcastLike(event.id, displayLikeCount + 1);
    } catch (err) {
      console.warn('Failed to register like:', err);
    }
  };

  // Cleanup is handled by useViewerPresence (Presence untrack + DB session deactivation).

  const handleViewerTap = () => {
    if (!isMobile) return;
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < 280) {
      triggerLike();
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = now;
    setShowControls(true);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if ((window as any).agoraPlayer) {
      (window as any).agoraPlayer.setVolume(Math.floor(newVolume * 100));
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if ((window as any).agoraPlayer) {
      if (newMutedState) {
        (window as any).agoraPlayer.setVolume(0);
      } else {
        (window as any).agoraPlayer.setVolume(Math.floor(volume * 100));
      }
    }
  };

  const togglePause = () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    if ((window as any).agoraPlayer) {
      if (newPausedState) {
        (window as any).agoraPlayer.muteAudio(true);
        (window as any).agoraPlayer.muteVideo(true);
      } else {
        (window as any).agoraPlayer.muteAudio(isMuted);
        (window as any).agoraPlayer.muteVideo(false);
      }
    }
  };

  const toggleFullscreen = async () => {
    const videoContainer = videoPlayerContainerRef.current;
    if (!videoContainer) return;

    try {
      if (!document.fullscreenElement) {
        if (window.innerWidth < 768 && (screen.orientation as any)?.lock) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch (orientationError) {
            console.warn('Could not lock orientation:', orientationError);
          }
        }
        if ((videoContainer as any).requestFullscreen) {
          await (videoContainer as any).requestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen failed:', err);
    }
  };

  const handleQuitClick = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (_) {
        /* ignore */
      }
    }
    setShowQuitConfirm(true);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const generateViewerToken = async (channel: string, uid: number, role = 'audience') => {
    return generateToken(channel, uid, role, 3600);
  };

  const handlePayment = async () => {
    if (!event) return;
    
    if (hasTicket) {
      alert(t('watch.alertAlreadyHaveTicket'));
      return;
    }

    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventId: event.id,
          email: user?.email || guestEmail || undefined,
          returnPath: checkoutReturnPath,
        },
      });

      if (error) {
        console.error('Error creating checkout session:', error);
        const errorMessage = await extractFunctionError(error);
        alert(errorMessage);
        return;
      }

      if (!data) {
        alert(t('watch.alertInvalidResponse'));
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
          alert(t('watch.alertStripeNotConfigured'));
          return;
        }

        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(stripePublicKey);
        
        if (!stripe) {
          alert(t('watch.alertFailedLoadStripe'));
          return;
        }

        const { error: redirectError } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        });

        if (redirectError) {
          alert(redirectError.message || t('watch.alertFailedRedirect'));
        }
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      alert(error.message || t('watch.alertPaymentUnavailable'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleMobileMoneyPayment = async () => {
    if (!event) return;
    if (hasTicket) {
      alert(t('watch.alertAlreadyHaveTicket'));
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
    } else if (pawapayEnabled) {
      setMmModalMode('ticket');
      setMmCountryModalOpen(true);
      return;
    }
    setIsPurchasing(true);
    try {
      const res = await startMobileMoneyTicketCheckout({
        eventId: event.id,
        email: user?.email || guestEmail || undefined,
        phone: userProfile?.phone || undefined,
        returnPath: checkoutReturnPath,
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
    } catch (err: any) {
      alert(err?.message || t('watch.alertErrorOccurred'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleLiveReplayBundle = async () => {
    if (!event) return;
    if (hasTicket) return;
    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventId: event.id,
          email: user?.email || guestEmail || undefined,
          userId: user?.id || undefined,
          productType: 'bundle',
          returnPath: checkoutReturnPath,
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
      alert(err?.message || t('watch.alertCheckoutFailed'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleMobileMoneyLiveReplayBundle = async () => {
    if (!event) return;
    if (hasTicket) return;
    if (needsWalletFields) {
      if (mobileMoneyCapabilityAvailable === false || mobileMoneyCapabilityAvailable === null) {
        return;
      }
      if (!isMobileMoneySelectionComplete(mobileMoneySelection)) {
        alert(t('watch.selectCountryOperatorMm', 'Select your country and mobile operator for Mobile Money.'));
        return;
      }
    }
    setIsPurchasing(true);
    try {
      const res = await startMobileMoneyTicketCheckout({
        eventId: event.id,
        email: user?.email || guestEmail || undefined,
        userId: user?.id || undefined,
        productType: 'bundle',
        phone: userProfile?.phone || undefined,
        returnPath: checkoutReturnPath,
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
      else alert(t('watch.alertInvalidResponse'));
    } catch (err: any) {
      alert(err?.message || t('watch.alertErrorOccurred'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRedeemCredit = async () => {
    if (!event || !user?.id || bundleCreditsTotal < 1) return;
    if (hasTicket) return;
    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-bundle-credit', {
        body: { eventId: event.id },
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
      setHasTicket(true);
      setHasAccess(true);
      setBundleCreditsTotal((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      alert(err?.message || t('watch.alertFailedUseCredit'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleAddToCart = async () => {
    if (!event) return;
    
    if (isInCart(event.id)) {
      alert(t('watch.alertInCart'));
      return;
    }

    if (hasTicket) {
      alert(t('watch.alertAlreadyHaveTicket'));
      return;
    }

    addItem({
      eventId: event.id,
      eventTitle: event.title,
      eventImage: event.image_url || undefined,
      price: event.price || 0,
      artistName: event.profiles?.username || undefined,
      eventDate: event.start_time || undefined,
    });

    alert(t('watch.alertEventAddedToCart'));
  };

  const handleGetTicket = () => {
    if (!event) return;
    const price = event.price ?? 0;
    if (!isInCart(event.id)) {
      addItem({
        eventId: event.id,
        eventTitle: event.title,
        eventImage: event.image_url || undefined,
        price,
        artistName: event.profiles?.username || undefined,
        eventDate: event.start_time || undefined,
      });
    }
    navigate('/cart');
  };

  const replayPrice = (event?.replay_price ?? event?.price ?? 0) as number;
  const handleBuyReplay = async () => {
    if (!event) return;
    if (replayAccess?.canWatch) return;
    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventId: event.id,
          eventIds: [event.id],
          email: user?.email || guestEmail || undefined,
          userId: user?.id || undefined,
          isReplay: true,
          returnPath: checkoutReturnPath,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.error) throw new Error(data.error);
      throw new Error('Invalid response from checkout');
    } catch (err: any) {
      const msg = await extractFunctionError(err).catch(() => err?.message);
      alert(msg || t('watch.alertCheckoutFailed'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleBuyReplayMobileMoney = async () => {
    if (!event) return;
    if (replayAccess?.canWatch) return;
    if (needsWalletFields) {
      if (mobileMoneyCapabilityAvailable === false || mobileMoneyCapabilityAvailable === null) {
        return;
      }
      if (!isMobileMoneySelectionComplete(mobileMoneySelection)) {
        alert(t('watch.selectCountryOperatorMm', 'Select your country and mobile operator for Mobile Money.'));
        return;
      }
    } else if (pawapayEnabled) {
      setMmModalMode('replay');
      setMmCountryModalOpen(true);
      return;
    }
    setIsPurchasing(true);
    try {
      const res = await startMobileMoneyTicketCheckout({
        eventId: event.id,
        eventIds: [event.id],
        email: user?.email || guestEmail || undefined,
        userId: user?.id || undefined,
        isReplay: true,
        phone: userProfile?.phone || undefined,
        returnPath: checkoutReturnPath,
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
      else alert(t('watch.alertInvalidResponse'));
    } catch (err: any) {
      alert(err?.message || t('watch.alertCheckoutFailed'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleWatchMmCountryContinue = async (payload: {
    paymentCountryAlpha3: string;
    paymentCurrency: string;
    paymentAmount: string;
  }) => {
    if (!event || !mmModalMode) return;
    const { data, error } = await supabase.functions.invoke('create-pawapay-payment', {
      body:
        mmModalMode === 'replay'
          ? {
              eventId: event.id,
              eventIds: [event.id],
              isReplay: true,
              email: user?.email || guestEmail || undefined,
              userId: user?.id || undefined,
              phone: userProfile?.phone || undefined,
              returnPath: checkoutReturnPath,
              ...payload,
            }
          : {
              eventId: event.id,
              email: user?.email || guestEmail || undefined,
              phone: userProfile?.phone || undefined,
              returnPath: checkoutReturnPath,
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
      throw new Error(t('watch.alertInvalidResponse'));
    }
    const depositId = typeof data.deposit_id === 'string' ? data.deposit_id : undefined;
    if (depositId) {
      stashPawapayTicketCheckoutContext(depositId, {
        eventId: event.id,
        returnPath: checkoutReturnPath,
        isCart: false,
      });
    }
    window.location.href = data.url as string;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">{t('watch.loadingEvent')}</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-300">
          <p>{error || t('watch.eventNotFound', 'Event not found')}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg"
          >
            {t('watch.goHome', 'Go Home')}
          </button>
        </div>
      </div>
    );
  }

  const artistDisplayName =
    event.profiles?.username || event.profiles?.full_name || event.unregistered_artist_name || t('watch.artist', 'Artist');

  // Event is over if status is 'ended' or planned end time has passed (handles stale "live" from DB)
  const isEventOver =
    event.status === 'ended' ||
    (event.start_time &&
      (event.duration ?? 0) > 0 &&
      new Date(event.start_time).getTime() + (event.duration ?? 0) * 60 * 1000 < Date.now());
  const isLive = event.status === 'live' && !isEventOver;
  const showLivePlayer = isLive && channelName && hasAccess === true && !accessChecking && !sessionKicked;
  const needsTicket = isLive && !accessChecking && hasAccess === false;

  return (
    <div className={`min-h-screen bg-gray-900 ${showLivePlayer ? 'pt-0' : 'pt-16'}`}>
      {/* Session kicked: another device started watching with the same ticket */}
      {sessionKicked && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[110] flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-6 md:p-8 max-w-sm w-full border border-orange-500/30 shadow-2xl text-center">
            <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-orange-400" />
            </div>
            <h3 className="text-white text-xl md:text-2xl font-bold mb-2">{t('watch.sessionKickedTitle')}</h3>
            <p className="text-gray-400 text-sm md:text-base mb-6">{t('watch.sessionKickedMessage')}</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold transition-all shadow-lg"
            >
              {t('watch.goHome')}
            </button>
          </div>
        </div>
      )}

      {showQuitConfirm && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-6 md:p-8 max-w-sm w-full border border-white/10 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 bg-red-500 rounded-full"></div>
              </div>
              <h3 className="text-white text-xl md:text-2xl font-bold mb-2">{t('watch.quitWatching')}</h3>
              <p className="text-gray-400 text-sm md:text-base">{t('watch.quitConfirmMessage')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/', { replace: true })}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-bold transition-all transform active:scale-95 shadow-lg"
              >
                {t('watch.yesQuit')}
              </button>
              <button
                onClick={() => setShowQuitConfirm(false)}
                className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all transform active:scale-95 backdrop-blur-sm border border-white/10"
              >
                {t('watch.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLivePlayer ? (
        <div className="fixed inset-0 bg-black z-40" onClick={handleViewerTap} onTouchStart={handleViewerTap}>
          <style>{`
            .watch-fullscreen {
              width: 100vw;
              height: 100vh;
            }
            .watch-fullscreen video {
              width: 100vw !important;
              height: 100vh !important;
              object-fit: contain !important;
              object-position: center !important;
              background: #000 !important;
            }
            .like-burst {
              animation: like-pop 0.5s ease;
            }
            @keyframes like-pop {
              0% { transform: scale(0.6); opacity: 0; }
              60% { transform: scale(1.1); opacity: 1; }
              100% { transform: scale(1.2); opacity: 0; }
            }
          `}</style>
          <div ref={videoPlayerContainerRef} className="absolute inset-0 w-screen h-screen bg-black watch-fullscreen">
            <AgoraPlayer
              channelName={channelName}
              generateTokenFn={generateViewerToken}
              uid={Math.floor(Math.random() * 1000000)}
              onViewerJoin={handleViewerJoin}
              onViewerLeave={handleViewerLeave}
              onVideoContainerReady={(container) => {
                videoContainerRef.current = container;
              }}
              onClientReady={(client) => {
                setStreamingClient(client);
              }}
              videoQuality={videoQuality}
            />

            {showControls && (
              <>
                {!isMobile && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4 z-10">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                      >
                        <X className="h-6 w-6 text-white" />
                      </button>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center text-white">
                          <Users className="h-5 w-5 mr-2" />
                          <span className="font-semibold">{displayViewerCount}</span>
                        </div>
                        <div className="flex items-center text-pink-400">
                          <Heart className="h-5 w-5 mr-1" fill="currentColor" />
                          <span className="font-semibold text-white">{displayLikeCount}</span>
                        </div>
                        <div className="flex items-center bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                          <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                          {t('watch.liveBadge')}
                        </div>
                        {event.live_started_at && (
                          <div
                            className="flex items-center gap-1.5 text-white/95 text-sm font-mono tabular-nums bg-black/35 px-2.5 py-1 rounded-lg border border-white/10"
                            title={t('watch.liveElapsedHint')}
                          >
                            <Clock className="h-4 w-4 opacity-90 shrink-0" aria-hidden />
                            <span>{t('watch.liveFor', { time: formatLiveElapsed(liveElapsedSec) })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isMobile ? (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePause();
                          }}
                          className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"
                        >
                          {isPaused ? <Play className="h-6 w-6 text-white ml-1" /> : <Pause className="h-6 w-6 text-white" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMute();
                          }}
                          className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"
                        >
                          {isMuted ? <VolumeX className="h-6 w-6 text-white" /> : <Volume2 className="h-6 w-6 text-white" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFullscreen();
                          }}
                          className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"
                        >
                          {isFullscreen ? <Minimize className="h-6 w-6 text-white" /> : <Maximize className="h-6 w-6 text-white" />}
                        </button>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center bg-red-600 text-white px-3 py-1.5 rounded-full text-sm font-semibold">
                          <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                          {t('watch.liveBadge')}
                        </div>
                        {event.live_started_at && (
                          <div
                            className="flex items-center gap-1 text-white/95 text-xs font-mono tabular-nums bg-black/40 px-2 py-1 rounded-md border border-white/10"
                            title={t('watch.liveElapsedHint')}
                          >
                            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {formatLiveElapsed(liveElapsedSec)}
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(-1);
                          }}
                          className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"
                        >
                          <X className="h-6 w-6 text-white" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center text-white text-sm space-x-4">
                      <span className="flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        {displayViewerCount}
                      </span>
                      <span className="flex items-center text-pink-400">
                        <Heart className="h-4 w-4 mr-1" fill="currentColor" />
                        <span className="text-white">{displayLikeCount}</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 md:p-4 z-10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 md:space-x-4 flex-1 min-w-0">
                        <button
                          onClick={togglePause}
                          className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors flex-shrink-0"
                        >
                          {isPaused ? <Play className="h-5 w-5 md:h-6 md:w-6 text-white ml-0.5 md:ml-1" /> : <Pause className="h-5 w-5 md:h-6 md:w-6 text-white" />}
                        </button>

                        <div className="flex items-center space-x-1 md:space-x-2 flex-1 min-w-0">
                          <button onClick={toggleMute} className="text-white hover:text-purple-400 transition-colors flex-shrink-0">
                            {isMuted ? <VolumeX className="h-5 w-5 md:h-6 md:w-6" /> : <Volume2 className="h-5 w-5 md:h-6 md:w-6" />}
                          </button>

                          <div className="w-16 md:w-24 flex-1">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={isMuted ? 0 : volume}
                              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                              className="w-full h-1.5 md:h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isViewerActive && (
                          <div className="relative quality-menu-container">
                            <button
                              onClick={() => setShowQualityMenu(!showQualityMenu)}
                              className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                              title={t('watch.videoQuality', 'Video Quality')}
                            >
                              <Settings className="h-5 w-5 md:h-6 md:w-6 text-white" />
                            </button>
                            {showQualityMenu && (
                              <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-xl rounded-lg shadow-2xl border border-white/10 py-2 min-w-[120px] z-50">
                                {['auto', '1080p', '720p', '480p', '360p'].map((quality) => (
                                  <button
                                    key={quality}
                                    onClick={() => {
                                      setVideoQuality(quality);
                                      setShowQualityMenu(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                      videoQuality === quality
                                        ? 'bg-purple-600/30 text-white'
                                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {quality === 'auto' ? t('watch.auto', 'Auto') : quality.toUpperCase()}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={toggleFullscreen}
                          className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                          title={isFullscreen ? t('watch.exitFullscreen', 'Exit fullscreen') : t('watch.enterFullscreen', 'Enter fullscreen')}
                        >
                          {isFullscreen ? <Minimize className="h-5 w-5 md:h-6 md:w-6 text-white" /> : <Maximize className="h-5 w-5 md:h-6 md:w-6 text-white" />}
                        </button>
                        <button
                          onClick={handleQuitClick}
                          className="bg-gradient-to-r from-red-600 via-red-600 to-red-700 hover:from-red-700 hover:via-red-700 hover:to-red-800 text-white px-3 py-2 rounded-lg shadow-lg flex items-center space-x-1 transition-all duration-300 font-semibold text-xs md:text-sm"
                          title={t('watch.quitTitle')}
                          type="button"
                        >
                          {t('watch.quit')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Like burst */}
            {showLikeBurst && (
              <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                <Heart className="w-16 h-16 text-pink-500 like-burst" fill="currentColor" />
              </div>
            )}

            {/* Like button (right side) */}
            <div className="absolute right-4 bottom-24 z-30 flex flex-col items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerLike();
                }}
                className="p-3 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
                title={t('watch.like', 'Like')}
              >
                <Heart className="w-6 h-6 text-pink-500" fill="currentColor" />
              </button>
              <div className="text-xs text-white/80">{displayLikeCount}</div>
            </div>
          </div>
        </div>
      ) : accessChecking && isLive ? (
        <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[50vh]">
          <div className="bg-gray-800 rounded-xl p-8 text-center max-w-md">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-300 font-medium">{t('watch.checkingAccess', 'Checking access...')}</p>
            <p className="text-gray-500 text-sm mt-1">{t('watch.verifyingTicket', 'Verifying your ticket')}</p>
          </div>
        </div>
      ) : needsTicket ? (
        <div className="container mx-auto px-4 py-8">
          <div className="bg-gray-800 rounded-xl p-8 text-center max-w-lg mx-auto border border-amber-500/30">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{event.title}</h1>
            <p className="text-gray-400 mb-4">{t('watch.youNeedTicket')}</p>
            <p className="text-gray-500 text-sm mb-6">
              {t('watch.purchaseTicketOrSignIn')}
            </p>
            {event.price != null && event.price > 0 && (
              <p className="text-lg font-semibold text-white mb-6">
                ${(event.price as number).toFixed(2)} {t('watch.perTicket')}
              </p>
            )}
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleGetTicket}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-purple-500/30"
              >
                {isInCart(event.id) ? t('watch.goToCartAndPay') : t('watch.getTicket')}
              </button>
              <button
                onClick={() => navigate(`/`)}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all border border-white/10"
              >
                {t('watch.browseEvents')}
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-3 text-gray-400 hover:text-white rounded-xl font-medium transition-all"
              >
                {t('watch.goBack')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-6 inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white px-4 py-2.5 text-sm font-medium transition-all border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('watch.back')}
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Event Image & Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Replay: video player (if access) or placeholder */}
              {isEventOver && event.video_url && (
                <>
                  {replayAccessChecking ? (
                    <div className="w-full aspect-video rounded-2xl bg-gray-800/80 flex items-center justify-center min-h-[300px]">
                      <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500 border-t-transparent" />
                    </div>
                  ) : replayAccess?.canWatch ? (
                    <div className="w-full rounded-2xl overflow-hidden shadow-2xl bg-black">
                      <SimpleVideoPlayer streamUrl={event.video_url} />
                      <div className="px-3 py-2 bg-gray-900/90 flex items-center gap-2 text-sm text-gray-300">
                        {replayAccess.reason === 'free' && (
                          <span className="text-green-400">{t('watch.replayFreeIncluded')}</span>
                        )}
                        {replayAccess.reason === 'replay_ticket' && (
                          <span className="text-purple-400">{t('watch.replayWatchOnDemand')}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
                      {event.image_url ? (
                        <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <Play className="w-20 h-20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <p className="text-white font-semibold text-center px-4">{t('watch.replayAvailablePurchase')}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Event Image - Grand Display (when no replay or no video_url) */}
              {event.image_url && !(isEventOver && event.video_url) && (
                <div className="relative w-full h-[500px] md:h-[600px] rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src={event.image_url}
                    alt={event.title}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: `${event.image_focal_x ?? 50}% ${event.image_focal_y ?? 25}%` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                </div>
              )}

              {/* Event Title & Artist */}
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  {event.title}
                </h1>
                <div className="flex items-center gap-3 mb-6">
                  <User className="h-6 w-6 text-violet-400" />
                  <span className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                    {artistDisplayName}
                  </span>
                  {(event.profiles?.username || event.unregistered_artist_name) && (
                    <span className="text-violet-400 text-xl">✓</span>
                  )}
                </div>

                {/* Date, Time, Duration */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                  {event.start_time && (
                    <>
                      <span className="inline-flex items-center gap-2 text-gray-300">
                        <Calendar className="h-5 w-5 text-violet-400" />
                        {new Date(event.start_time).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {event.start_time && (
                          <span className="ml-2">
                            {new Date(event.start_time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                  {event.duration != null && event.duration > 0 && (
                    <span className="text-gray-400">
                      <span className="font-semibold text-gray-300">{t('watch.durationMin', { count: event.duration })}</span>
                    </span>
                  )}
                </div>

                {/* Status Badge */}
                <div className="mb-6">
                  {event.status === 'scheduled' && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/20 text-blue-300 px-4 py-2 text-sm font-semibold ring-1 ring-blue-400/30">
                      {t('watch.scheduled')}
                    </span>
                  )}
                  {isEventOver && (
                    <span className="inline-flex items-center rounded-full bg-gray-500/20 text-gray-300 px-4 py-2 text-sm font-semibold ring-1 ring-gray-400/30">
                      {t('watch.streamHasEnded')}
                    </span>
                  )}
                  {event.status === 'ended' && !isEventOver && (
                    <span className="inline-flex items-center rounded-full bg-gray-500/20 text-gray-300 px-4 py-2 text-sm font-semibold ring-1 ring-gray-400/30">
                      {t('watch.ended')}
                    </span>
                  )}
                  {event.status !== 'scheduled' && event.status !== 'ended' && !isEventOver && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/20 text-amber-300 px-4 py-2 text-sm font-semibold ring-1 ring-amber-400/30">
                      {t('watch.notLive')}
                    </span>
                  )}
                </div>

                {/* Event Description */}
                {(event.description?.trim() ?? '') !== '' && (
                  <div className="text-gray-200 leading-relaxed">
                    <p>{event.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Ticket Purchase & Actions */}
            <div className="lg:col-span-1 space-y-6">
              {showMobileMoney && needsWalletFields && mmWalletExpanded ? (
                <div className="bg-violet-950/25 border border-violet-500/20 rounded-xl p-4">
                  <p className="text-sm font-medium text-violet-200 mb-2">
                    {t('watch.mobileMoneyWallet', 'Mobile Money wallet')}
                  </p>
                  <MobileMoneyCountryOperatorFields
                    value={mobileMoneySelection}
                    onChange={setMobileMoneySelection}
                    disabled={isPurchasing}
                    mobileMoneyIntent
                    onCapabilitiesResolved={onMobileMoneyCapabilitiesResolved}
                  />
                </div>
              ) : null}
              {/* Watch on demand (replay) - after 3h or no live ticket; gated by replays_enabled */}
              {replaysEnabled && isEventOver && event.video_url && !replayAccessChecking && !replayAccess?.canWatch && (
                <div className="bg-gray-800/95 rounded-2xl border border-white/10 p-6 shadow-xl">
                  <h2 className="text-xl font-bold text-white mb-1">{t('watch.watchOnDemand')}</h2>
                  <p className="text-gray-400 text-sm mb-4">
                    {t('watch.replayAvailableToPurchase')}
                  </p>
                  {replayPrice > 0 && (
                    <div className="mb-4">
                      <span className="text-2xl font-bold text-white">${replayPrice.toFixed(2)}</span>
                      <span className="text-gray-400 text-sm ml-2">{t('watch.oneTime')}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleBuyReplay}
                      disabled={isPurchasing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CreditCard className="h-5 w-5" />
                      {isPurchasing ? t('watch.processing') : t('watch.buyReplayCard')}
                    </button>
                    {showMobileMoney ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (needsWalletFields && !mmWalletExpanded) {
                            setMmWalletExpanded(true);
                            return;
                          }
                          setTimeout(() => void handleBuyReplayMobileMoney(), 0);
                        }}
                        disabled={
                          isPurchasing ||
                          (needsWalletFields &&
                            mmWalletExpanded &&
                            (mobileMoneyCapabilityAvailable === null ||
                              (mobileMoneyCapabilityAvailable === true &&
                                !isMobileMoneySelectionComplete(mobileMoneySelection))))
                        }
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Smartphone className="h-4 w-4" />
                        {t('watch.payWithMobileMoney')}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Ticket Purchase Section */}
              {!isLive && !isEventOver && event.price != null && event.price > 0 && (
                <div className="bg-gray-800/95 rounded-2xl border border-white/10 p-6 shadow-xl">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <h2 className="text-xl font-bold text-white">{t('watch.liveStream')}</h2>
                  </div>

                  {!hasTicket && (
                    <>
                      {/* Live only */}
                      <div
                        className={`mb-4 pb-4 ${
                          liveReplayBundleEnabled && replaysEnabled ? 'border-b border-white/10' : ''
                        }`}
                      >
                        <p className="text-gray-300 font-medium mb-1">{t('watch.liveOnly')}</p>
                        <p className="text-2xl font-bold text-white">${(Number(event.price) * 1.25).toFixed(2)}</p>
                        <p className="text-gray-400 text-xs">${Number(event.price).toFixed(2)} {t('watch.feeAndVat')}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button
                            onClick={handlePayment}
                            disabled={isPurchasing}
                            className={`flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${showMobileMoney ? 'flex-1 min-w-[100px]' : 'w-full'}`}
                          >
                            <CreditCard className="h-4 w-4" />
                            {t('watch.card')}
                          </button>
                          {showMobileMoney ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (needsWalletFields && !mmWalletExpanded) {
                                  setMmWalletExpanded(true);
                                  return;
                                }
                                setTimeout(() => void handleMobileMoneyPayment(), 0);
                              }}
                              disabled={
                                isPurchasing ||
                                (needsWalletFields &&
                                  mmWalletExpanded &&
                                  (mobileMoneyCapabilityAvailable === null ||
                                    (mobileMoneyCapabilityAvailable === true &&
                                      !isMobileMoneySelectionComplete(mobileMoneySelection))))
                              }
                              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Smartphone className="h-4 w-4" />
                              {t('watch.payWithMobileMoney')}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Live + Replay bundle (super admin toggle + replays platform-wide) */}
                      {liveReplayBundleEnabled && replaysEnabled && (
                        <div className="mb-4 pb-4 border-b border-white/10">
                          <p className="text-gray-300 font-medium mb-1">{t('watch.livePlusReplay')}</p>
                          <p className="text-2xl font-bold text-white">$4.36</p>
                          <p className="text-gray-400 text-xs">$3.49 {t('watch.feeAndVat')} · {t('watch.bestValue')}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button
                              onClick={handleLiveReplayBundle}
                              disabled={isPurchasing}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${showMobileMoney ? 'flex-1 min-w-[100px]' : 'w-full'}`}
                            >
                              <CreditCard className="h-4 w-4" />
                              {t('watch.card')}
                            </button>
                            {showMobileMoney ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (needsWalletFields && !mmWalletExpanded) {
                                    setMmWalletExpanded(true);
                                    return;
                                  }
                                  setTimeout(() => void handleMobileMoneyLiveReplayBundle(), 0);
                                }}
                                disabled={
                                  isPurchasing ||
                                  (needsWalletFields &&
                                    mmWalletExpanded &&
                                    (mobileMoneyCapabilityAvailable === null ||
                                      (mobileMoneyCapabilityAvailable === true &&
                                        !isMobileMoneySelectionComplete(mobileMoneySelection))))
                                }
                                className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Smartphone className="h-4 w-4" />
                                {t('watch.payWithMobileMoney')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {bundlesEnabled && bundleCreditsTotal > 0 && (
                        <div className="mb-4">
                          <button
                            onClick={handleRedeemCredit}
                            disabled={isPurchasing}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Ticket className="h-5 w-5" />
                            {isPurchasing ? t('watch.processing') : t('watch.useCredit', { count: bundleCreditsTotal })}
                          </button>
                        </div>
                      )}

                      {!isInCart(event.id) && (
                        <button
                          onClick={handleAddToCart}
                          disabled={isPurchasing}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ShoppingCart className="h-4 w-4" />
                          {t('watch.addToCart')}
                        </button>
                      )}
                    </>
                  )}
                  
                  {hasTicket && (
                    <div className="text-center py-4">
                      <p className="text-green-400 font-semibold mb-2">✓ {t('watch.youHaveTicket')}</p>
                      <button
                        onClick={() => navigate(`/watch/${event.id}`)}
                        className="text-purple-400 hover:text-purple-300 underline text-sm"
                      >
                        {t('watch.watchNow')}
                      </button>
                    </div>
                  )}

                  {!user && (
                    <p className="text-center mt-4 text-sm text-gray-400">
                      {t('watch.alreadyHaveTicketLogin')}{' '}
                      <button
                        onClick={() => navigate('/login')}
                        className="text-purple-400 hover:text-purple-300 underline"
                      >
                        {t('watch.clickHereToLogIn')}
                      </button>
                    </p>
                  )}
                </div>
              )}

              {/* Artist Interaction Section — registered artist or admin-scheduled unregistered name */}
              {(event.artist_id || event.unregistered_artist_name) && (
                <div className="bg-gray-800/95 rounded-2xl border border-white/10 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">{t('watch.featuring')}</h3>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                      {artistDisplayName[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white">
                        {artistDisplayName.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {/* Interaction Buttons Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {event.artist_id && user?.id !== event.artist_id && (
                      <>
                        <FollowButton
                          artistId={event.artist_id}
                          variant="compact"
                          className="w-full"
                        />
                        <SendTipButton
                          artistId={event.artist_id}
                          artistName={artistDisplayName}
                          variant="compact"
                          className="w-full"
                        />
                      </>
                    )}
                    {!event.artist_id && event.unregistered_artist_name && (
                      <SendTipButton
                        artistId={String(event.id)}
                        artistName={artistDisplayName}
                        variant="compact"
                        className="w-full col-span-2"
                      />
                    )}
                    <ShareButton
                      url={`/watch/${event.id}`}
                      title={event.title}
                      description={event.description || `${artistDisplayName} - ${event.title}`}
                      imageUrl={event.image_url || ''}
                      variant="button"
                      className="w-full"
                    />
                    {event.start_time && (
                      <AddToCalendarButton
                        title={event.title}
                        description={event.description || ''}
                        startDate={event.start_time}
                        endDate={event.start_time && event.duration 
                          ? new Date(new Date(event.start_time).getTime() + event.duration * 60000).toISOString()
                          : undefined}
                        url={`${window.location.origin}/watch/${event.id}`}
                        variant="compact"
                        className="w-full"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {event ? (
        <MobileMoneyCountryModal
          open={mmCountryModalOpen}
          onClose={() => {
            setMmCountryModalOpen(false);
            setMmModalMode(null);
          }}
          eventPriceUsd={
            mmModalMode === 'replay'
              ? Number(event.replay_price ?? event.price ?? 0)
              : Number(event.price ?? 0)
          }
          onContinue={handleWatchMmCountryContinue}
        />
      ) : null}
    </div>
  );
};

export default Watch;
