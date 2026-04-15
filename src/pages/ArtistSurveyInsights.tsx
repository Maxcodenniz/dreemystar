import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabaseClient';
import { AlertCircle, BarChart3, Calendar, Search, User, Users } from 'lucide-react';

interface SurveyRow {
  id: number;
  user_id: string;
  artist_name: string;
  source: 'initial' | 'popup';
  created_at: string;
  profiles?: {
    id: string;
    username: string | null;
    full_name: string | null;
    email: string | null;
    user_type: string;
  } | null;
}

const ArtistSurveyInsights: React.FC = () => {
  const { userProfile } = useStore();
  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'initial' | 'popup'>('all');
  const [search, setSearch] = useState('');

  const isAdmin =
    userProfile?.user_type === 'global_admin' ||
    userProfile?.user_type === 'super_admin';

  useEffect(() => {
    if (!isAdmin) return;
    const fetchRows = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
          .from('artist_survey_wishlist')
          .select(
            `
            id,
            user_id,
            artist_name,
            source,
            created_at,
            profiles:profiles!inner (
              id,
              username,
              full_name,
              email,
              user_type
            )
          `
          )
          .order('created_at', { ascending: false });

        if (error) throw error;
        setRows((data as SurveyRow[]) || []);
      } catch (err: any) {
        console.error('Error fetching artist survey insights:', err);
        setError(err?.message || 'Failed to load survey responses.');
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [isAdmin]);

  if (!userProfile || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center">
        <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-3xl p-10 border border-red-500/40 shadow-2xl max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center border-4 border-red-500/50">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Access restricted
          </h2>
          <p className="text-gray-400 text-sm">
            Only Admins and Super Admins can view artist survey insights.
          </p>
        </div>
      </div>
    );
  }

  const filtered = rows.filter((row) => {
    if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const profile = row.profiles;
    return (
      row.artist_name.toLowerCase().includes(q) ||
      profile?.username?.toLowerCase().includes(q) ||
      profile?.full_name?.toLowerCase().includes(q) ||
      profile?.email?.toLowerCase().includes(q)
    );
  });

  const totalSuggestions = rows.length;
  const uniqueArtists = new Set(rows.map((r) => r.artist_name.toLowerCase())).size;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 px-6 relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/40 to-pink-500/40 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              Artist Survey Insights
            </h1>
            <p className="text-gray-400 mt-2 max-w-2xl">
              See which artists fans want to see live and their top 5 favorites after signup.
              Use this data to decide who to invite or sign.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 backdrop-blur-xl">
              <div className="w-9 h-9 rounded-xl bg-purple-500/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-semibold">
                  Total suggestions
                </p>
                <p className="text-lg font-bold text-white">{totalSuggestions}</p>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 backdrop-blur-xl">
              <div className="w-9 h-9 rounded-xl bg-pink-500/30 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-semibold">
                  Unique artists
                </p>
                <p className="text-lg font-bold text-white">{uniqueArtists}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex-1 relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by artist name, username, full name, or email..."
              className="w-full pl-11 pr-4 py-2.5 bg-gradient-to-br from-gray-900/80 to-gray-800/60 backdrop-blur-xl border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="px-3 py-2 bg-gradient-to-br from-gray-900/80 to-gray-800/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
            >
              <option value="all">All</option>
              <option value="initial">Initial favorites</option>
              <option value="popup">Popup wish list</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-gradient-to-br from-gray-900/80 via-gray-900/90 to-gray-950/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-gradient-to-r from-purple-900/40 via-gray-900/40 to-pink-900/40">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Artist name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">
                      Loading survey responses...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">
                      No survey responses found for the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {row.artist_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                        {row.profiles?.username || row.profiles?.full_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {row.profiles?.email || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            row.source === 'initial'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          }`}
                        >
                          {row.source === 'initial' ? 'Initial favorites' : 'Popup wish list'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span>{new Date(row.created_at).toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtistSurveyInsights;

