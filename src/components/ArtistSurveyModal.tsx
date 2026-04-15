import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, User as UserIcon, Star } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';

interface ArtistSurveyModalProps {
  mode: 'initial' | 'popup';
  onCompleted?: () => void;
  onClose?: () => void;
}

interface SuggestionRow {
  id: number;
  country: string;
  artist_name: string;
}

const ArtistSurveyModal: React.FC<ArtistSurveyModalProps> = ({ mode, onCompleted, onClose }) => {
  const { t } = useTranslation();
  const { userProfile } = useStore();
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [wishlistArtist, setWishlistArtist] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxCountries, setMaxCountries] = useState<number>(5);
  const [artistsPerCountry, setArtistsPerCountry] = useState<number>(5);

  if (!userProfile) return null;

  useEffect(() => {
    if (mode !== 'initial') return;
    const fetchData = async () => {
      try {
        // Fetch config limits
        const { data: cfg } = await supabase
          .from('app_config')
          .select('key, value')
          .in('key', ['artist_survey_max_countries', 'artist_survey_artists_per_country']);

        if (cfg) {
          cfg.forEach((item) => {
            const numeric =
              typeof item.value === 'number'
                ? item.value
                : parseInt(String(item.value), 10);
            if (item.key === 'artist_survey_max_countries' && Number.isFinite(numeric)) {
              setMaxCountries(Math.max(1, numeric));
            }
            if (item.key === 'artist_survey_artists_per_country' && Number.isFinite(numeric)) {
              setArtistsPerCountry(Math.max(1, numeric));
            }
          });
        }

        // Fetch suggestions
        const { data: rows, error: rowsError } = await supabase
          .from('artist_survey_suggestions')
          .select('id,country,artist_name,enabled,display_order')
          .eq('enabled', true)
          .order('country', { ascending: true })
          .order('display_order', { ascending: true });

        if (rowsError) throw rowsError;

        if (rows && rows.length > 0) {
          setSuggestions(
            rows.map((r: any) => ({
              id: r.id,
              country: r.country,
              artist_name: r.artist_name
            }))
          );
        }
      } catch (err) {
        console.error('Error loading artist survey suggestions:', err);
      }
    };
    fetchData();
  }, [mode, userProfile?.id]);

  const groupedSuggestions = useMemo(() => {
    if (mode !== 'initial') return [];
    const byCountry: Record<string, SuggestionRow[]> = {};
    suggestions.forEach((row) => {
      if (!byCountry[row.country]) byCountry[row.country] = [];
      byCountry[row.country].push(row);
    });
    const countries = Object.keys(byCountry).sort();
    const limitedCountries = countries.slice(0, maxCountries);
    return limitedCountries.map((country) => {
      const artists = byCountry[country].slice(0, artistsPerCountry);
      return { country, artists };
    });
  }, [suggestions, maxCountries, artistsPerCountry, mode]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedIds.length === 0) {
      setError('Please select at least one artist.');
      return;
    }
    if (selectedIds.length > 5) {
      setError('You can select up to 5 artists.');
      return;
    }

    const idSet = new Set(selectedIds);
    const picked = suggestions.filter((s) => idSet.has(s.id));
    const names = picked.map((p) => p.artist_name);

    try {
      setSubmitting(true);

      // Insert each favorite as an initial survey response
      const rows = names.map((artistName) => ({
        user_id: userProfile.id,
        artist_name: artistName,
        source: 'initial' as const
      }));

      const { error: insertError } = await supabase
        .from('artist_survey_wishlist')
        .insert(rows);

      if (insertError) throw insertError;

      // Also store favorites on profile for quick access
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          favorite_artists: names,
          survey_initial_completed: true
        })
        .eq('id', userProfile.id);

      if (updateError) throw updateError;

      // Mark as completed locally (avoid re-show)
      try {
        const key = `survey_initial_completed_${userProfile.id}`;
        window.localStorage.setItem(key, '1');
      } catch {
        // ignore storage errors
      }

      onCompleted?.();
    } catch (err: any) {
      console.error('Error submitting initial artist survey:', err);
      setError(err?.message || 'Failed to submit survey. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWishlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = wishlistArtist.trim();
    if (!name) {
      setError('Please enter at least one artist name.');
      return;
    }

    try {
      setSubmitting(true);

      const { error: insertError } = await supabase
        .from('artist_survey_wishlist')
        .insert({
          user_id: userProfile.id,
          artist_name: name,
          source: 'popup'
        });

      if (insertError) throw insertError;

      // Remember that we asked recently
      try {
        const key = `survey_wishlist_last_shown_${userProfile.id}`;
        window.localStorage.setItem(key, Date.now().toString());
      } catch {
        // ignore storage errors
      }

      onCompleted?.();
    } catch (err: any) {
      console.error('Error submitting wishlist survey:', err);
      setError(err?.message || 'Failed to submit your suggestion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (mode === 'popup') {
      // Also mark as shown if user closes manually
      try {
        const key = `survey_wishlist_last_shown_${userProfile.id}`;
        window.localStorage.setItem(key, Date.now().toString());
      } catch {
        // ignore
      }
    }
    onClose?.();
  };

  const title =
    mode === 'initial'
      ? 'Tell us your 5 favorite artists'
      : 'Which artist do you want to see online soon?';

  const description =
    mode === 'initial'
      ? 'Help us understand your taste so we can bring the right artists live on Dreemystar.'
      : 'Suggest an artist you would love to watch live on Dreemystar. Your suggestion helps us choose who to invite next.';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-xl bg-gradient-to-br from-gray-900 via-gray-850 to-gray-950 border border-white/10 rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white">{title}</h2>
            <p className="text-sm text-gray-400 mt-1">{description}</p>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {mode === 'initial' ? (
          <form onSubmit={handleInitialSubmit} className="space-y-4 mt-2">
            <p className="text-xs text-gray-400 mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              Select up to 5 artists you would love to see on Dreemystar.
            </p>

            {groupedSuggestions.length === 0 ? (
              <p className="text-sm text-gray-400">
                No suggestions configured yet. Please contact an admin.
              </p>
            ) : (
              groupedSuggestions.map(({ country, artists }) => (
                <div key={country}>
                  <p className="text-xs font-semibold text-gray-300 mb-2">{country}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {artists.map((artist) => {
                      const selected = selectedIds.includes(artist.id);
                      return (
                        <button
                          key={artist.id}
                          type="button"
                          onClick={() => toggleSelect(artist.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                            selected
                              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-400 shadow-lg shadow-purple-500/40'
                              : 'bg-white/5 text-gray-200 border-white/15 hover:bg-white/10'
                          }`}
                        >
                          {artist.artist_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-gray-400">
                Selected <span className="font-semibold text-white">{selectedIds.length}</span> / 5
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-300 hover:text-white transition-colors"
                  disabled={submitting}
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={submitting || groupedSuggestions.length === 0}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Saving...' : 'Save favorites'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleWishlistSubmit} className="space-y-4 mt-2">
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
              <input
                type="text"
                value={wishlistArtist}
                onChange={(e) => setWishlistArtist(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
                placeholder="Type the artist name you want to see live"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-300 hover:text-white transition-colors"
                disabled={submitting}
              >
                Not now
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending...' : 'Send suggestion'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ArtistSurveyModal;

