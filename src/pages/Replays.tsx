import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { Play, Calendar, Clock, User, FileVideo } from 'lucide-react';
import SmartImage from '../components/SmartImage';

interface ReplayItem {
  id: string;
  event_id: string;
  artist_id: string;
  title: string;
  description: string | null;
  video_url: string;
  duration: number | null;
  recording_ended_at: string | null;
  events: {
    id: string;
    title: string;
    start_time: string | null;
    image_url: string | null;
    image_focal_x?: number | null;
    image_focal_y?: number | null;
  } | null;
  profiles: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

const Replays: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [replays, setReplays] = useState<ReplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaysEnabled, setReplaysEnabled] = useState(true);

  useEffect(() => {
    fetchReplays();
  }, []);

  useEffect(() => {
    const fetchReplaysEnabled = async () => {
      try {
        const { data, error: configError } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'replays_enabled')
          .maybeSingle();
        if (!configError && data != null) {
          setReplaysEnabled(data.value === true || data.value === 'true');
        }
      } catch {
        setReplaysEnabled(true);
      }
    };
    fetchReplaysEnabled();
  }, []);

  const fetchReplays = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('recordings')
        .select(`
          id,
          event_id,
          artist_id,
          title,
          description,
          video_url,
          duration,
          recording_ended_at,
          events (
            id,
            title,
            start_time,
            image_url,
            image_focal_x,
            image_focal_y
          ),
          profiles (
            id,
            username,
            full_name,
            avatar_url
          )
        `)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .order('recording_ended_at', { ascending: false });

      if (fetchError) throw fetchError;

      setReplays((data || []) as ReplayItem[]);
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.error('Error fetching replays:', err);
      setError(t('replays.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredReplays = replays.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const eventTitle = item.events?.title?.toLowerCase() ?? '';
    const recordingTitle = item.title?.toLowerCase() ?? '';
    const artistName = item.profiles?.full_name?.toLowerCase() ?? '';
    const artistUsername = item.profiles?.username?.toLowerCase() ?? '';
    return (
      eventTitle.includes(q) ||
      recordingTitle.includes(q) ||
      artistName.includes(q) ||
      artistUsername.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 pb-12 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
              <FileVideo className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">
                {t('replays.title')}
              </h1>
              <p className="text-gray-400 mt-1">
                {t('replays.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder={t('replays.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
        </div>

        {/* Replays disabled (platform toggle) */}
        {!replaysEnabled && (
          <div className="mb-6 p-4 rounded-xl bg-gray-700/50 border border-gray-500/30 text-gray-300">
            <p className="font-medium">{t('replays.unavailable')}</p>
            <p className="text-sm mt-1 text-gray-400">{t('replays.unavailableHint')}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 text-red-300 px-6 py-4 rounded-xl">
            {error}
          </div>
        )}

        {/* Grid */}
        {!replaysEnabled ? null : loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500/30 border-t-purple-500" />
          </div>
        ) : filteredReplays.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-3xl p-12 text-center border border-white/10 shadow-2xl">
            <FileVideo className="w-20 h-20 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t('replays.noReplays')}</h3>
            <p className="text-gray-400">
              {searchQuery ? t('replays.noReplaysSearch') : t('replays.noReplaysDefault')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredReplays.map((item) => {
              const eventId = item.event_id;
              const eventTitle = item.events?.title ?? item.title;
              const artistName = item.profiles?.full_name || item.profiles?.username || 'Artist';
              const imageUrl = item.events?.image_url ?? null;
              const duration = formatDuration(item.duration);
              const date = item.recording_ended_at || item.events?.start_time;

              return (
                <div
                  key={item.id}
                  className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 shadow-xl hover:shadow-2xl hover:border-purple-500/20 transition-all duration-300 group"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-gray-900">
                    {imageUrl ? (
                      <SmartImage
                        src={imageUrl}
                        alt={eventTitle}
                        variant="cardLandscape"
                        focalX={item.events?.image_focal_x ?? 50}
                        focalY={item.events?.image_focal_y ?? 25}
                        containerClassName="w-full h-full"
                        className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        <Play className="w-16 h-16 text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <button
                        onClick={() => navigate(`/watch/${eventId}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center shadow-lg"
                        aria-label={t('replays.watchReplay')}
                      >
                        <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
                      </button>
                    </div>
                    {duration && (
                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-xs text-gray-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {duration}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-bold text-lg text-white mb-2 line-clamp-2">{eventTitle}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                      <User className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{artistName}</span>
                    </div>
                    {date && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {new Date(date).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => navigate(`/watch/${eventId}`)}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      {t('replays.watchReplay')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Replays;
