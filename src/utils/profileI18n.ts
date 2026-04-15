/** Profile (or artist) with optional bio and bio_i18n */
export interface ProfileWithBio {
  bio?: string | null;
  bio_i18n?: Record<string, string> | null;
}

/** Normalize i18n language (e.g. "en-US") to content locale key */
function normalizeLocale(lang: string): 'en' | 'es' | 'fr' {
  const base = (lang || 'en').split('-')[0].toLowerCase();
  if (base === 'es' || base === 'fr') return base;
  return 'en';
}

/**
 * Get the translated biography for a profile.
 * Uses bio_i18n[locale] ?? bio_i18n.en ?? bio.
 */
export function getProfileBio(profile: ProfileWithBio | null | undefined, locale: string): string | null {
  if (!profile) return null;
  const normalized = normalizeLocale(locale);
  const i18n = profile.bio_i18n;
  if (i18n && typeof i18n === 'object') {
    const value = i18n[normalized] ?? i18n.en;
    if (value != null && value !== '') return value;
  }
  const fallback = profile.bio;
  return fallback != null && fallback !== '' ? fallback : null;
}

/** Get biography for display (never null; returns empty string if none) */
export function getProfileBioDisplay(profile: ProfileWithBio | null | undefined, locale: string, fallbackLabel: string): string {
  return getProfileBio(profile, locale) ?? fallbackLabel;
}
