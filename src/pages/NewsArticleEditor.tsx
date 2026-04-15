import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { NewsArticle as NewsArticleType, NEWS_CATEGORIES, NewsCategory } from '../types/news';
import { getImageDimensions } from '../utils/imageOrientation';
import RichTextEditor from '../components/RichTextEditor';
import { ArrowLeft, Save, Upload, Image as ImageIcon, AlertCircle, Languages } from 'lucide-react';

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'article';
}

const AdminNewsEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userProfile } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    category: 'platform' as NewsCategory,
    excerpt: '',
    content: '',
    featured_image: '',
    author: userProfile?.full_name || userProfile?.username || userProfile?.email || 'Dreemystar',
    is_featured: false,
    status: 'draft' as 'draft' | 'published',
    featured_image_orientation: null as 'portrait' | 'landscape' | 'square' | null,
    featured_image_width: null as number | null,
    featured_image_height: null as number | null,
    featured_focal_x: null as number | null,
    featured_focal_y: null as number | null,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  type TranslationFields = { title: string; excerpt: string; content: string; author: string };
  const [translations, setTranslations] = useState<Record<'es' | 'fr', TranslationFields>>({
    es: { title: '', excerpt: '', content: '', author: '' },
    fr: { title: '', excerpt: '', content: '', author: '' },
  });
  const [translating, setTranslating] = useState(false);

  const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';

  const handleAutoTranslate = async () => {
    const title = formData.title.trim();
    const excerpt = formData.excerpt.trim();
    const content = formData.content.trim();
    const author = formData.author.trim();
    if (!title && !excerpt && !content) {
      setError(t('news.admin.autoTranslateError'));
      return;
    }
    setTranslating(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('translate-news-article', {
        body: { title, excerpt, content, author },
      });
      if (fnError) throw fnError;
      const result = data?.translations;
      if (result?.es || result?.fr) {
        setTranslations((prev) => ({
          es: result.es
            ? { title: result.es.title ?? '', excerpt: result.es.excerpt ?? '', content: result.es.content ?? '', author: result.es.author ?? '' }
            : prev.es,
          fr: result.fr
            ? { title: result.fr.title ?? '', excerpt: result.fr.excerpt ?? '', content: result.fr.content ?? '', author: result.fr.author ?? '' }
            : prev.fr,
        }));
        setSuccess(t('news.admin.autoTranslateSuccess'));
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (_err) {
      setError(t('news.admin.autoTranslateError'));
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    if (!userProfile) return;
    setFormData((prev) => ({
      ...prev,
      author: userProfile.full_name || userProfile.username || userProfile.email || prev.author,
    }));
  }, [userProfile]);

  useEffect(() => {
    if (!id || !isAdmin) return;
    (async () => {
      const { data, error: e } = await supabase.from('news_articles').select('*').eq('id', id).single();
      if (e || !data) {
        setError(t('news.articleNotFound'));
        setLoading(false);
        return;
      }
      const art = data as NewsArticleType;
      setFormData({
        title: art.title,
        slug: art.slug,
        category: art.category,
        excerpt: art.excerpt || '',
        content: art.content || '',
        featured_image: art.featured_image || '',
        author: art.author,
        is_featured: art.is_featured ?? false,
        status: art.status,
        featured_image_orientation: (art as any).featured_image_orientation ?? null,
        featured_image_width: (art as any).featured_image_width ?? null,
        featured_image_height: (art as any).featured_image_height ?? null,
        featured_focal_x: (art as any).featured_focal_x ?? null,
        featured_focal_y: (art as any).featured_focal_y ?? null,
      });
      setTranslations({
        es: {
          title: (art.title_i18n as Record<string, string> | undefined)?.es ?? '',
          excerpt: (art.excerpt_i18n as Record<string, string> | undefined)?.es ?? '',
          content: (art.content_i18n as Record<string, string> | undefined)?.es ?? '',
          author: (art.author_i18n as Record<string, string> | undefined)?.es ?? '',
        },
        fr: {
          title: (art.title_i18n as Record<string, string> | undefined)?.fr ?? '',
          excerpt: (art.excerpt_i18n as Record<string, string> | undefined)?.fr ?? '',
          content: (art.content_i18n as Record<string, string> | undefined)?.fr ?? '',
          author: (art.author_i18n as Record<string, string> | undefined)?.fr ?? '',
        },
      });
      setPreviewUrl(art.featured_image || null);
      setLoading(false);
    })();
  }, [id, isAdmin]);

  useEffect(() => {
    if (!isEdit && formData.title) {
      setFormData((prev) => ({ ...prev, slug: slugFromTitle(prev.title) }));
    }
  }, [formData.title, isEdit]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t('news.admin.imageTooBig'));
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const filePath = fileName;
    const { error: uploadError } = await supabase.storage
      .from('news-images')
      .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('news-images').getPublicUrl(filePath);
    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let featured_image = formData.featured_image;
      let featured_image_orientation = formData.featured_image_orientation;
      let featured_image_width = formData.featured_image_width;
      let featured_image_height = formData.featured_image_height;
      if (fileInputRef.current?.files?.[0]) {
        featured_image = await uploadImage(fileInputRef.current.files[0]);
        if (featured_image) {
          try {
            const dims = await getImageDimensions(featured_image);
            featured_image_orientation = dims.orientation;
            featured_image_width = dims.width;
            featured_image_height = dims.height;
          } catch {
            // keep existing or null
          }
        }
      }
      const titleI18n: Record<string, string> = { en: formData.title.trim() };
      if (translations.es.title.trim()) titleI18n.es = translations.es.title.trim();
      if (translations.fr.title.trim()) titleI18n.fr = translations.fr.title.trim();
      const excerptI18n: Record<string, string> = { en: formData.excerpt.trim() || '' };
      if (translations.es.excerpt.trim()) excerptI18n.es = translations.es.excerpt.trim();
      if (translations.fr.excerpt.trim()) excerptI18n.fr = translations.fr.excerpt.trim();
      const contentI18n: Record<string, string> = { en: formData.content.trim() || '' };
      if (translations.es.content.trim()) contentI18n.es = translations.es.content.trim();
      if (translations.fr.content.trim()) contentI18n.fr = translations.fr.content.trim();
      const authorI18n: Record<string, string> = { en: formData.author.trim() };
      if (translations.es.author.trim()) authorI18n.es = translations.es.author.trim();
      if (translations.fr.author.trim()) authorI18n.fr = translations.fr.author.trim();

      const payload = {
        title: formData.title.trim(),
        slug: (formData.slug || slugFromTitle(formData.title)).trim(),
        category: formData.category,
        excerpt: formData.excerpt.trim() || null,
        content: formData.content.trim() || null,
        featured_image: featured_image || null,
        author: formData.author.trim(),
        is_featured: formData.is_featured,
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date().toISOString() : null,
        featured_image_orientation: featured_image_orientation || null,
        featured_image_width: featured_image_width ?? null,
        featured_image_height: featured_image_height ?? null,
        featured_focal_x: formData.featured_focal_x ?? null,
        featured_focal_y: formData.featured_focal_y ?? null,
        title_i18n: Object.keys(titleI18n).length ? titleI18n : null,
        excerpt_i18n: Object.keys(excerptI18n).length ? excerptI18n : null,
        content_i18n: Object.keys(contentI18n).length ? contentI18n : null,
        author_i18n: Object.keys(authorI18n).length ? authorI18n : null,
      };
      if (isEdit && id) {
        const { error: err } = await supabase.from('news_articles').update(payload).eq('id', id);
        if (err) throw err;
        setSuccess(t('news.admin.articleUpdated'));
      } else {
        const { error: err } = await supabase.from('news_articles').insert(payload);
        if (err) throw err;
        setSuccess(t('news.admin.articleCreated'));
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || t('news.admin.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  if (!userProfile || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 rounded-2xl p-8 border border-white/10 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">{t('news.admin.accessDenied')}</h2>
          <p className="text-gray-400">{t('news.admin.needAdminEdit')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500/30 border-t-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => navigate('/admin/news')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">{isEdit ? t('news.admin.editArticle') : t('news.admin.newArticleHeading')}</h1>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>{t('news.admin.dismiss')}</button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
            {success}
          </div>
        )}

        <form className="space-y-6" onSubmit={(e) => handleSubmit(e, false)}>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.titleLabel')}</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 outline-none"
              placeholder={t('news.admin.titlePlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.slugLabel')}</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-purple-500/50 outline-none"
              placeholder={t('news.admin.slugPlaceholder')}
            />
            <p className="text-xs text-gray-500 mt-1">{t('news.admin.slugHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.categoryLabel')}</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as NewsCategory })}
              className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500/50 outline-none"
            >
              {NEWS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{t(`news.category.${cat}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.excerptLabel')}</label>
            <textarea
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-purple-500/50 outline-none resize-y"
              placeholder={t('news.admin.excerptPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.featuredImage')}</label>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            {previewUrl ? (
              <div className="space-y-2">
                <div
                  className="relative rounded-xl overflow-hidden border border-white/10 aspect-video max-w-xl cursor-crosshair"
                  onClick={(e) => {
                    const target = e.currentTarget;
                    const rect = target.getBoundingClientRect();
                    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                    setFormData((prev) => ({ ...prev, featured_focal_x: x, featured_focal_y: y }));
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                  aria-label="Click to set focal point"
                >
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                    style={{
                      objectPosition: `${formData.featured_focal_x ?? 50}% ${formData.featured_focal_y ?? 50}%`,
                    }}
                  />
                  <div
                    className="absolute w-8 h-8 border-2 border-white rounded-full pointer-events-none shadow-lg"
                    style={{
                      left: `${formData.featured_focal_x ?? 50}%`,
                      top: `${formData.featured_focal_y ?? 50}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); setFormData((prev) => ({ ...prev, featured_image: '', featured_focal_x: null, featured_focal_y: null })); fileInputRef.current && (fileInputRef.current.value = ''); }}
                    className="absolute top-2 right-2 p-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white"
                  >
                    {t('news.admin.remove')}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {t('news.admin.focalPoint', { x: formData.featured_focal_x ?? 50, y: formData.featured_focal_y ?? 50 })}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <Upload className="w-5 h-5" />
                {t('news.admin.uploadImage')}
              </button>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.contentLabel')}</label>
            <RichTextEditor
              key={id ?? 'new'}
              value={formData.content}
              onChange={(html) => setFormData((prev) => ({ ...prev, content: html }))}
              placeholder={t('news.admin.contentPlaceholder')}
              minHeight="340px"
              allowImages
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('news.admin.authorLabel')}</label>
            <input
              type="text"
              value={formData.author}
              onChange={(e) => setFormData({ ...formData, author: e.target.value })}
              className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-purple-500/50 outline-none"
              required
            />
          </div>

          {/* Translations (optional) */}
          <div className="border border-white/10 rounded-xl p-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{t('news.admin.translations')}</h3>
              <p className="text-xs text-gray-500 mb-3">{t('news.admin.translationsHint')}</p>
              <button
                type="button"
                onClick={handleAutoTranslate}
                disabled={translating || (!formData.title.trim() && !formData.excerpt.trim() && !formData.content.trim())}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                <Languages className="w-4 h-4" />
                {translating ? t('news.admin.autoTranslating') : t('news.admin.autoTranslate')}
              </button>
            </div>
            {(['es', 'fr'] as const).map((lang) => (
              <div key={lang} className="space-y-3 pl-2 border-l-2 border-purple-500/30">
                <h4 className="text-sm font-medium text-purple-300">
                  {lang === 'es' ? t('news.admin.languageSpanish') : t('news.admin.languageFrench')}
                </h4>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('news.admin.titleLabel')}</label>
                  <input
                    type="text"
                    value={translations[lang].title}
                    onChange={(e) => setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], title: e.target.value } }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm outline-none"
                    placeholder={t('news.admin.titlePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('news.admin.excerptLabel')}</label>
                  <textarea
                    value={translations[lang].excerpt}
                    onChange={(e) => setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], excerpt: e.target.value } }))}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm resize-y outline-none"
                    placeholder={t('news.admin.excerptPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('news.admin.contentLabel')}</label>
                  <RichTextEditor
                    key={`${id ?? 'new'}-${lang}`}
                    value={translations[lang].content}
                    onChange={(html) => setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], content: html } }))}
                    placeholder={t('news.admin.contentPlaceholder')}
                    minHeight="200px"
                    allowImages
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('news.admin.authorLabel')}</label>
                  <input
                    type="text"
                    value={translations[lang].author}
                    onChange={(e) => setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], author: e.target.value } }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm outline-none"
                    placeholder={formData.author}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="featured"
              checked={formData.is_featured}
              onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
              className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
            />
            <label htmlFor="featured" className="text-gray-300">{t('news.admin.featureOnHomepage')}</label>
          </div>
          <div className="flex flex-wrap gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? t('news.admin.saving') : t('news.admin.saveDraft')}
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 transition-colors"
            >
              {t('news.admin.publish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminNewsEditor;
