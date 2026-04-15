/**
 * Normalize article content for display.
 * - If content looks like HTML (contains tags), return as-is.
 * - If plain text, convert double line breaks to paragraphs for backward compatibility.
 */
export function normalizeArticleContent(content: string | null | undefined): string {
  const raw = (content || '').trim();
  if (!raw) return '';

  const hasHtml = /<[a-z][\s\S]*>/i.test(raw);
  if (hasHtml) return raw;

  return raw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
