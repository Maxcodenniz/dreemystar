import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchEventsMergedWithRetry } from '../utils/eventsFetch';
import { formatSupabaseQueryError } from '../utils/formatSupabaseQueryError';
import { devLogBackendFailure, devLogSupabaseNotConfiguredOnce } from '../utils/devBackendLog';
import UpcomingConcertsComponent from '../components/UpcomingConcerts';
import { Concert, Artist } from '../types';
import { AlertCircle, Calendar } from 'lucide-react';

const UpcomingConcertsPage: React.FC = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      if (!isSupabaseConfigured) {
        setFetchError(formatSupabaseQueryError(new Error('Service unavailable')));
        setEvents([]);
        return;
      }
      const data = await fetchEventsMergedWithRetry(supabase);

      const now = new Date();
      let validEvents = (data || []).filter(
        (event: any) =>
          event.profiles != null || event.unregistered_artist_name || event.artist_id
      );

      validEvents = validEvents.filter((event: any) => event.status !== 'ended');

      validEvents = validEvents.filter((event: any) => {
        const eventStart = new Date(event.start_time);
        return event.status !== 'live' && now < eventStart;
      });

      setEvents(validEvents);
    } catch (error) {
      devLogBackendFailure('UpcomingConcertsPage.fetchEvents', error);
      setFetchError(formatSupabaseQueryError(error));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

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
    isLive: false,
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
      } else if (event.unregistered_artist_name) {
        return {
          id: event.id,
          name: event.unregistered_artist_name,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 flex items-center justify-center relative overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500/30 border-t-purple-500 mx-auto mb-4"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 border-2 border-purple-500/20"></div>
          </div>
          <p className="text-gray-400 font-medium">{t('upcomingConcerts.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-16 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
      
      <div className="container mx-auto px-6 py-8 relative z-10">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent flex items-center mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mr-3 shadow-xl shadow-purple-500/30">
              <Calendar className="h-7 w-7 text-white" />
            </div>
            {t('upcomingConcerts.title')}
          </h1>
          <p className="text-gray-400 text-lg">
            {t('upcomingConcerts.subtitle')}
          </p>
        </div>
        {fetchError && (
          <div
            className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 flex items-start gap-3"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-100/90 break-words">{fetchError}</p>
          </div>
        )}
        <UpcomingConcertsComponent concerts={concerts} artists={artists} />
      </div>
    </div>
  );
};

export default UpcomingConcertsPage;

