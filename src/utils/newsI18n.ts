import type { NewsArticle } from '../types/news';

/** Supported content locales; must match i18n */
export const NEWS_CONTENT_LOCALES = ['en', 'es', 'fr'] as const;
export type NewsContentLocale = (typeof NEWS_CONTENT_LOCALES)[number];

/** Normalize i18n language (e.g. "en-US") to a content locale key */
export function normalizeContentLocale(lang: string): NewsContentLocale {
  const base = (lang || 'en').split('-')[0].toLowerCase();
  if (base === 'es' || base === 'fr') return base;
  return 'en';
}

type I18nField = 'title' | 'excerpt' | 'content' | 'author';

/**
 * Get the translated value for an article field.
 * Uses article[field_i18n]?.[locale] ?? article[field_i18n]?.en ?? article[field].
 */
export function getArticleTranslatedField(
  article: NewsArticle,
  field: I18nField,
  locale: string
): string | null {
  const normalizedLocale = normalizeContentLocale(locale);
  const i18n = article[`${field}_i18n` as keyof NewsArticle] as Record<string, string> | undefined | null;
  if (i18n && typeof i18n === 'object') {
    const value = i18n[normalizedLocale] ?? i18n.en;
    if (value != null && value !== '') return value;
  }
  const fallback = article[field];
  return fallback != null && fallback !== '' ? fallback : null;
}

/** Get title for display (never null for valid article) */
export function getArticleTitle(article: NewsArticle, locale: string): string {
  return getArticleTranslatedField(article, 'title', locale) ?? article.title ?? '';
}

/** Get excerpt for display */
export function getArticleExcerpt(article: NewsArticle, locale: string): string | null {
  return getArticleTranslatedField(article, 'excerpt', locale);
}

/** Get content HTML for display */
export function getArticleContent(article: NewsArticle, locale: string): string | null {
  return getArticleTranslatedField(article, 'content', locale);
}

/** Get author for display */
export function getArticleAuthor(article: NewsArticle, locale: string): string {
  return getArticleTranslatedField(article, 'author', locale) ?? article.author ?? '';
}
