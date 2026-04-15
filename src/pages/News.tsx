import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { NewsArticle as NewsArticleType, NEWS_CATEGORIES, NewsCategory } from '../types/news';
import { getArticleTitle, getArticleExcerpt, getArticleAuthor } from '../utils/newsI18n';
import { Newspaper, Calendar, User, ChevronRight, TrendingUp } from 'lucide-react';
import SmartImage from '../components/SmartImage';

const PAGE_SIZE = 9;
const TRENDING_LIMIT = 5;

const formatDate = (dateStr: string | null, locale: string = 'en') => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
};

const ensurePublicImageUrl = (url: string | null): string | null => {
  if (!url) return null;
  if (url.includes('/storage/v1/object/profiles/') && !url.includes('/public/')) {
    return url.replace('/storage/v1/object/profiles/', '/storage/v1/object/public/profiles/');
  }
  if (url.includes('/storage/v1/object/news-images/') && !url.includes('/public/')) {
    return url.replace('/storage/v1/object/news-images/', '/storage/v1/object/public/news-images/');
  }
  return url;
};

const News: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [featured, setFeatured] = useState<NewsArticleType | null>(null);
  const [articles, setArticles] = useState<NewsArticleType[]>([]);
  const [trending, setTrending] = useState<NewsArticleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<NewsCategory | 'all'>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeatured = useCallback(async () => {
    let { data } = await supabase
      .from('news_articles')
      .select('*')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .eq('is_featured', true)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      const { data: latest } = await supabase
        .from('news_articles')
        .select('*')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = latest;
    }
    return data as NewsArticleType | null;
  }, []);

  const fetchLatest = useCallback(async (offset: number, cat: NewsCategory | 'all') => {
    let q = supabase
      .from('news_articles')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (cat !== 'all') q = q.eq('category', cat);
    const { data, count } = await q;
    return { data: (data || []) as NewsArticleType[], count: count ?? 0 };
  }, []);

  const fetchTrending = useCallback(async () => {
    const { data } = await supabase
      .from('news_articles')
      .select('*')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('views', { ascending: false })
      .limit(TRENDING_LIMIT);
    return (data || []) as NewsArticleType[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [feat, trend] = await Promise.all([
          fetchFeatured(),
          fetchTrending(),
        ]);
        if (cancelled) return;
        setFeatured(feat);
        setTrending(trend);
        const { data, count } = await fetchLatest(0, category);
        if (cancelled) return;
        setArticles(data);
        const n = data?.length ?? 0;
        setHasMore(n < (count ?? 0));
        setPage(1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, fetchFeatured, fetchTrending, fetchLatest]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const offset = page * PAGE_SIZE;
    const { data, count } = await fetchLatest(offset, category);
    setArticles((prev) => [...prev, ...data]);
    setHasMore(offset + data.length < (count ?? 0));
    setPage((p) => p + 1);
    setLoadingMore(false);
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        <div className="relative z-10 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500/30 border-t-purple-500 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">{t('news.loading')}</p>
        </div>
      </div>
    );
  }

  const featuredImg = ensurePublicImageUrl(featured?.featured_image ?? null) || 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-20 pb-16 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <header className="text-center mb-10 md:mb-14">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent flex items-center justify-center gap-3 flex-wrap">
            <Newspaper className="w-10 h-10 md:w-12 md:h-12 text-purple-400" />
            {t('news.pageTitle')}
          </h1>
          <p className="text-gray-400 text-lg mt-3 max-w-2xl mx-auto">
            {t('news.subtitle')}
          </p>
        </header>

        {/* Featured Article */}
        {featured && (
          <section className="mb-12 md:mb-16">
            <Link
              to={`/news/${featured.slug}`}
              className="block group rounded-2xl overflow-hidden bg-gray-900/60 border border-white/10 hover:border-purple-500/30 transition-all duration-300 shadow-xl hover:shadow-purple-500/20"
            >
              <div className="relative aspect-[21/9] md:aspect-[3/1] overflow-hidden">
                <div className="absolute inset-0">
                  <SmartImage
                    src={featuredImg}
                    alt={getArticleTitle(featured, locale)}
                    variant="hero"
                    eager
                    orientation={featured.featured_image_orientation ?? undefined}
                    focalX={featured.featured_focal_x ?? undefined}
                    focalY={featured.featured_focal_y ?? undefined}
                    containerClassName="h-full w-full"
                    className="absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 text-white">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-purple-500/80 text-white">
                      {t(`news.category.${featured.category}`)}
                    </span>
                    {featured.category === 'artist' && (
                      <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-400 text-black">
                        {t('news.artistSpotlight')}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl md:text-4xl font-bold mb-2 group-hover:text-purple-200 transition-colors">
                    {getArticleTitle(featured, locale)}
                  </h2>
                    <p className="text-gray-300 text-sm md:text-base line-clamp-2 max-w-3xl mb-4">
                    {getArticleExcerpt(featured, locale) || t('news.readMore')}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {getArticleAuthor(featured, locale)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(featured.published_at, i18n.language || 'en')}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 mt-4 text-purple-300 font-medium group-hover:gap-2 transition-all">
                    {t('news.readArticle')}
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </Link>
          </section>
        )}

        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 min-w-0">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${category === 'all' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
              >
                {t('news.all')}
              </button>
              {NEWS_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${category === cat ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                >
                  {t(`news.category.${cat}`)}
                </button>
              ))}
            </div>

            {/* Latest Articles grid */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">{t('news.latestArticles')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {articles.filter((art) => art.id !== featured?.id).map((art) => {
                  const img = ensurePublicImageUrl(art.featured_image) || 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg';
                  return (
                    <Link
                      key={art.id}
                      to={`/news/${art.slug}`}
                      className="group block rounded-xl overflow-hidden bg-gray-900/60 border border-white/10 hover:border-purple-500/30 transition-all duration-300"
                    >
                      <div className="overflow-hidden">
                        <SmartImage
                          src={img}
                          alt={getArticleTitle(art, locale)}
                          variant="card"
                          orientation={art.featured_image_orientation ?? undefined}
                          focalX={art.featured_focal_x ?? undefined}
                          focalY={art.featured_focal_y ?? undefined}
                          containerClassName="w-full"
                          className="transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-purple-400">
                            {t(`news.category.${art.category}`)}
                          </span>
                          {art.category === 'artist' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-400 text-black">
                              {t('news.artistSpotlight')}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-white mt-1 line-clamp-2 group-hover:text-purple-200 transition-colors">
                          {getArticleTitle(art, locale)}
                        </h3>
                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                          {getArticleExcerpt(art, locale) || t('news.readMore')}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {formatDate(art.published_at, i18n.language || 'en')}
                        </p>
                        <span className="inline-flex items-center gap-1 mt-2 text-purple-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('news.readMore')}
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {articles.length === 0 && (
                <p className="text-gray-500 py-8 text-center">{t('news.noArticlesInCategory')}</p>
              )}
              {hasMore && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? t('news.loadingMore') : t('news.loadMore')}
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* Trending sidebar */}
          <aside className="lg:w-80 flex-shrink-0">
            <div className="sticky top-24 rounded-xl bg-gray-900/60 border border-white/10 p-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                {t('news.trending')}
              </h2>
              <ul className="space-y-3">
                {trending.map((art, i) => (
                  <li key={art.id}>
                    <Link
                      to={`/news/${art.slug}`}
                      className="flex gap-3 group text-gray-300 hover:text-white transition-colors"
                    >
                      <span className="flex-shrink-0 w-6 h-6 rounded bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="line-clamp-2 group-hover:text-purple-200">{getArticleTitle(art, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {trending.length === 0 && (
                <p className="text-gray-500 text-sm">{t('news.noTrendingYet')}</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default News;
