export type NewsCategory = 'platform' | 'artist' | 'concerts' | 'industry' | 'tutorials';

export interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image: string | null;
  category: NewsCategory;
  author: string;
  status: 'draft' | 'published';
  views: number;
  is_featured: boolean;
  created_at: string;
  published_at: string | null;
  updated_at: string;
  event_id?: string | null;
  featured_image_orientation?: 'portrait' | 'landscape' | 'square' | null;
  featured_focal_x?: number | null;
  featured_focal_y?: number | null;
  /** Translated title: { "en": "...", "es": "...", "fr": "..." } */
  title_i18n?: Record<string, string> | null;
  excerpt_i18n?: Record<string, string> | null;
  content_i18n?: Record<string, string> | null;
  author_i18n?: Record<string, string> | null;
}

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  platform: 'Platform Updates',
  artist: 'Artist Spotlights',
  concerts: 'Live Concerts',
  industry: 'Music Industry',
  tutorials: 'Tutorials',
};

export const NEWS_CATEGORIES: NewsCategory[] = ['platform', 'artist', 'concerts', 'industry', 'tutorials'];
