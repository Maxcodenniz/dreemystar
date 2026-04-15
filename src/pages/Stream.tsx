import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import AgoraStreamingStudio from '../components/AgoraStreamingStudio';
import MobileLiveStudio from '../components/MobileLiveStudio';
import { Concert } from '../types';
import { Lock, Tv, Smartphone, Monitor } from 'lucide-react';

const Stream: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const streamKey = searchParams.get('key');
  const { t } = useTranslation();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidKey, setIsValidKey] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [studioMode, setStudioMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showMobileStudio, setShowMobileStudio] = useState(false);

  useEffect(() => {
    const checkMobileDevice = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobileUA = mobileRegex.test(userAgent.toLowerCase());
      const isMobileWidth = window.innerWidth < 768;
      const isMobile = isMobileUA || isMobileWidth;

      setIsMobileDevice(isMobile);
      if (isMobile) {
        setStudioMode('mobile');
        setShowMobileStudio(true);
      }
    };

    checkMobileDevice();
    window.addEventListener('resize', checkMobileDevice);
    return () => window.removeEventListener('resize', checkMobileDevice);
  }, []);

  useEffect(() => {
    validateStreamKey();
  }, [id, streamKey]);

  const validateStreamKey = async () => {
    if (!id || !streamKey) {
      setError('Invalid streaming link');
      setLoading(false);
      return;
    }

    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('stream_key', streamKey)
        .single();

      if (eventError) throw eventError;

      if (!eventData) {
        setError('Invalid stream key');
        setLoading(false);
        return;
      }

      setEvent(eventData);
      setIsValidKey(true);
    } catch (err) {
      console.error('Error validating stream key:', err);
      setError('Failed to validate stream key');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (error || !isValidKey) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full text-center">
          <Lock className="h-16 w-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
          <p className="text-gray-400">
            {error || 'You do not have permission to access this stream'}
          </p>
        </div>
      </div>
    );
  }

  const concert: Concert = {
    id: event.id,
    artistId: event.artist_id,
    title: event.title,
    date: event.start_time,
    time: new Date(event.start_time).toLocaleTimeString(),
    imageUrl: event.image_url,
    description: event.description,
    categories: ['Music'],
    duration: event.duration,
    isLive: event.status === 'live',
    price: event.price,
    maxTickets: 1000,
    soldTickets: 0,
    streamUrl: event.stream_url,
  };

  return (
    <>
      <div className="flex flex-col md:flex-row min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white relative overflow-hidden">
        {/* Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl"></div>
        </div>

        {/* Left Sidebar - Desktop only */}
        <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-72 border-r border-white/5 bg-gradient-to-b from-black/80 via-gray-950/60 to-black/80 backdrop-blur-2xl p-6 flex-col z-40 shadow-2xl overflow-y-auto">
          <div className="mb-10">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Tv className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
                  {t('goLivePage.creatorStudio', 'Creator Studio')}
                </h2>
                <p className="text-xs text-gray-500 uppercase tracking-widest">{t('goLivePage.professional', 'Professional')}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs text-gray-500 mb-4 font-bold uppercase tracking-widest">{t('goLivePage.studioMode', 'Studio Mode')}</p>
            <div className="space-y-2">
              <button
                onClick={() => setStudioMode('desktop')}
                className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 ${
                  studioMode === 'desktop'
                    ? 'bg-gradient-to-r from-blue-600/30 to-cyan-600/30 text-blue-200 border-2 border-blue-500/50 shadow-xl shadow-blue-500/20'
                    : 'hover:bg-white/5 text-gray-400 border border-transparent hover:border-white/10'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mr-3 ${
                  studioMode === 'desktop' ? 'bg-blue-500/20' : 'bg-white/5'
                }`}>
                  <Monitor className="w-5 h-5" />
                </div>
                <span className="font-semibold">{t('goLivePage.desktopView', 'Desktop View')}</span>
              </button>
              {isMobileDevice && (
                <button
                  onClick={() => {
                    setStudioMode('mobile');
                    setShowMobileStudio(true);
                  }}
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 ${
                    studioMode === 'mobile'
                      ? 'bg-gradient-to-r from-pink-600/30 to-rose-600/30 text-pink-200 border-2 border-pink-500/50 shadow-xl shadow-pink-500/20'
                      : 'hover:bg-white/5 text-gray-400 border border-transparent hover:border-white/10'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mr-3 ${
                    studioMode === 'mobile' ? 'bg-pink-500/20' : 'bg-white/5'
                  }`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="font-semibold">{t('goLivePage.mobileLive', 'Mobile Live')}</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Top Bar */}
        <div className="md:hidden bg-gradient-to-r from-black/90 to-gray-950/90 backdrop-blur-xl border-b border-white/10 p-4 shadow-xl relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg">
                <Tv className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                  {t('goLivePage.creatorStudio', 'Creator Studio')}
                </h1>
                <p className="text-xs text-gray-500">{concert.title}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8 md:ml-72 flex flex-col gap-6 md:gap-8 overflow-y-auto pb-8 relative z-10">
          {/* Stream Info Header */}
          <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
                  <span className="text-sm font-bold text-red-400 uppercase tracking-wider">{t('goLivePage.liveBadge', 'LIVE')}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent mb-2">
                  {concert.title}
                </h1>
                <p className="text-gray-400 text-sm md:text-base">
                  {new Date(concert.date).toLocaleDateString('en', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Streaming Studio */}
          {studioMode === 'desktop' && (
            <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-br from-gray-900/90 to-black/90 backdrop-blur-sm">
              <AgoraStreamingStudio
                key={`stream-studio-${event.id}`}
                concert={concert}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile Studio Modal */}
      {isMobileDevice && showMobileStudio && event && (
        <MobileLiveStudio
          key={`mobile-studio-${event.id}`}
          concert={concert}
          onClose={() => {
            setShowMobileStudio(false);
            setStudioMode('desktop');
          }}
        />
      )}
    </>
  );
};

export default Stream;
