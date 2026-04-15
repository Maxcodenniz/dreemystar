import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { NewsArticle as NewsArticleType } from '../types/news';
import { Calendar, User, ArrowLeft, Share2 } from 'lucide-react';
import SmartImage from '../components/SmartImage';
import { normalizeArticleContent } from '../utils/articleContent';
import { getArticleTitle, getArticleExcerpt, getArticleContent, getArticleAuthor } from '../utils/newsI18n';

const formatDate = (dateStr: string | null, locale: string = 'en') => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
};

const ensurePublicImageUrl = (url: string | null): string | null => {
  if (!url) return null;
  if (url.includes('/storage/v1/object/') && !url.includes('/public/')) {
    return url.replace(/\/storage\/v1\/object\/([^/]+)\//, '/storage/v1/object/public/$1/');
  }
  return url;
};

const NewsArticle: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [article, setArticle] = useState<NewsArticleType | null>(null);
  const [related, setRelated] = useState<NewsArticleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError(t('news.missingArticle'));
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: art, error: fetchError } = await supabase
        .from('news_articles')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .maybeSingle();
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      if (!art) {
        setError(t('news.articleNotFound'));
        setLoading(false);
        return;
      }
      const a = art as NewsArticleType;
      setArticle(a);
      // Increment view count (fire-and-forget, via RPC so anon can call)
      supabase.rpc('increment_news_article_views', { article_id: a.id }).then(() => {});
      // Related: same category, exclude current, limit 3
      const { data: rel } = await supabase
        .from('news_articles')
        .select('*')
        .eq('status', 'published')
        .eq('category', a.category)
        .neq('id', a.id)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(3);
      if (!cancelled) setRelated((rel || []) as NewsArticleType[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, t]);

  // SEO: dynamic meta (use translated content when available)
  useEffect(() => {
    if (!article) return;
    const titleStr = getArticleTitle(article, locale);
    const authorStr = getArticleAuthor(article, locale);
    const excerptStr = getArticleExcerpt(article, locale);
    const isArtistSpotlight = article.category === 'artist';
    const baseTitle = isArtistSpotlight
      ? t('newsArticle.metaTitle', { title: authorStr || 'this artist' })
      : titleStr;
    const title = `${baseTitle} ${t('newsArticle.metaTitleSuffix')}`;
    const description = isArtistSpotlight
      ? t('newsArticle.metaDescription', { title: authorStr || 'this artist' })
      : (excerptStr || titleStr);
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
    const ogImage = document.querySelector('meta[property="og:image"]');
    const img = ensurePublicImageUrl(article.featured_image);
    if (ogImage && img) ogImage.setAttribute('content', img);
    const canonical = document.querySelector('link[rel="canonical"]');
    const base = window.location.origin;
    if (canonical) canonical.setAttribute('href', `${base}/news/${article.slug}`);
    return () => {
      document.title = t('newsArticle.defaultTitle');
    };
  }, [article, locale]);

  const share = () => {
    const url = window.location.href;
    const text = article ? `${getArticleTitle(article, locale)} ${t('newsArticle.metaTitleSuffix')}` : '';
    if (navigator.share) {
      navigator.share({ title: text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => alert(t('news.linkCopied')));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500/30 border-t-purple-500" />
      </div>
    );
  }
  if (error || !article) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 flex flex-col items-center justify-center px-4">
        <p className="text-gray-400 mb-4">{error || t('news.articleNotFound')}</p>
        <Link to="/news" className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          {t('news.backToNews')}
        </Link>
      </div>
    );
  }

  const featuredImg = ensurePublicImageUrl(article.featured_image) || 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg';
  const displayTitle = getArticleTitle(article, locale);
  const displayAuthor = getArticleAuthor(article, locale);
  const displayContent = getArticleContent(article, locale);

  return (
    <article className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-20 pb-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        <Link
          to="/news"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-purple-400 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('news.backToNews')}
        </Link>

        <header className="mb-8">
          <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 mb-4">
            {t(`news.category.${article.category}`)}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {displayTitle}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm">
            <span className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {displayAuthor}
            </span>
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {formatDate(article.published_at, i18n.language || 'en')}
            </span>
            <button
              type="button"
              onClick={share}
              className="flex items-center gap-2 hover:text-purple-400 transition-colors"
              aria-label={t('news.shareAria')}
            >
              <Share2 className="w-4 h-4" />
              {t('news.share')}
            </button>
          </div>
        </header>

        <div className="rounded-xl overflow-hidden mb-8 border border-white/10 min-h-[280px]">
          <SmartImage
            src={featuredImg}
            alt={displayTitle}
            variant="hero"
            eager
            orientation={article.featured_image_orientation ?? undefined}
            focalX={article.featured_focal_x ?? undefined}
            focalY={article.featured_focal_y ?? undefined}
            containerClassName="w-full"
            className="w-full"
          />
        </div>

        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: normalizeArticleContent(displayContent ?? article.content) }}
        />

        {related.length > 0 && (
          <section className="mt-12 pt-8 border-t border-white/10">
            <h2 className="text-xl font-semibold text-white mb-4">{t('news.relatedArticles')}</h2>
            <ul className="space-y-4">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/news/${r.slug}`}
                    className="block p-4 rounded-xl bg-gray-900/60 border border-white/10 hover:border-purple-500/30 transition-colors"
                  >
                    <span className="text-xs text-purple-400">{t(`news.category.${r.category}`)}</span>
                    <h3 className="font-semibold text-white mt-1 hover:text-purple-200">{getArticleTitle(r, locale)}</h3>
                    <p className="text-sm text-gray-500 mt-1">{formatDate(r.published_at, i18n.language || 'en')}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10">
          <Link
            to="/news"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('news.backToNews')}
          </Link>
        </div>
      </div>
    </article>
  );
};

export default NewsArticle;
