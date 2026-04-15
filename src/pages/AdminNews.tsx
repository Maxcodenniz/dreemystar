import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { NewsArticle as NewsArticleType } from '../types/news';
import { Plus, Edit, Trash2, Newspaper, AlertCircle } from 'lucide-react';

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const AdminNews: React.FC = () => {
  const { t } = useTranslation();
  const { userProfile } = useStore();
  const [articles, setArticles] = useState<NewsArticleType[]>([]);
  const [filter, setFilter] = useState<'all' | 'platform' | 'artist' | 'drafts' | 'published'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';

  useEffect(() => {
    if (!isAdmin) return;
    fetchArticles();
  }, [isAdmin]);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('news_articles')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) {
      setError(e.message);
      setArticles([]);
    } else {
      setArticles((data || []) as NewsArticleType[]);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('news.admin.deleteConfirm'))) return;
    setDeletingId(id);
    const { error: e } = await supabase.from('news_articles').delete().eq('id', id);
    if (e) setError(e.message);
    else await fetchArticles();
    setDeletingId(null);
  };

  if (!userProfile || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 rounded-2xl p-8 border border-white/10 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">{t('news.admin.accessDenied')}</h2>
          <p className="text-gray-400">{t('news.admin.needAdminAccess')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2 sm:mb-0">
              <Newspaper className="w-8 h-8 text-purple-400" />
              {t('news.admin.cmsTitle')}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${filter === 'all' ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
              >
                {t('news.admin.allArticles')}
              </button>
              <button
                type="button"
                onClick={() => setFilter('platform')}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${filter === 'platform' ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
              >
                {t('news.admin.platformUpdates')}
              </button>
              <button
                type="button"
                onClick={() => setFilter('artist')}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${filter === 'artist' ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
              >
                {t('news.admin.artistSpotlights')}
              </button>
              <button
                type="button"
                onClick={() => setFilter('drafts')}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${filter === 'drafts' ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
              >
                {t('news.admin.drafts')}
              </button>
              <button
                type="button"
                onClick={() => setFilter('published')}
                className={`px-3 py-1 rounded-full border text-xs font-medium ${filter === 'published' ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
              >
                {t('news.admin.published')}
              </button>
            </div>
          </div>
          <Link
            to="/admin/news/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t('news.admin.newArticle')}
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-white">{t('news.admin.dismiss')}</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500/30 border-t-purple-500" />
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">{t('news.admin.articleTitle')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">{t('news.admin.category')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">{t('news.admin.status')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">{t('news.admin.views')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">{t('news.admin.publishDate')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300 w-24">{t('news.admin.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {articles
                    .filter((art) => {
                      if (filter === 'platform') return art.category === 'platform';
                      if (filter === 'artist') return art.category === 'artist';
                      if (filter === 'drafts') return art.status === 'draft';
                      if (filter === 'published') return art.status === 'published';
                      return true;
                    })
                    .map((art) => (
                    <tr key={art.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/admin/news/edit/${art.id}`} className="text-white hover:text-purple-300 font-medium">
                          {art.title}
                        </Link>
                        {art.category === 'artist' && art.status === 'draft' && art.author === 'Dreemystar' && (
                          <div className="mt-1 text-[11px] text-amber-300 font-medium">
                            {t('news.admin.artistSpotlightAuto')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{t(`news.category.${art.category}`)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${art.status === 'published' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {art.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{art.views ?? 0}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{formatDate(art.published_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/admin/news/edit/${art.id}`}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            aria-label={t('news.admin.edit')}
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(art.id)}
                            disabled={deletingId === art.id}
                            className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            aria-label={t('news.admin.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {articles.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                {t('news.admin.noArticlesYet')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNews;
