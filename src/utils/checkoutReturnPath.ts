/**
 * Server and client agree: only same-site path (+ optional query), no open redirects.
 */
export function isSafeCheckoutReturnPath(p: string): boolean {
  if (!p.startsWith('/') || p.length > 256) return false;
  if (p.startsWith('//') || p.includes('..')) return false;
  if (/[\s<>"'\\]/.test(p)) return false;
  if (p.includes(':')) return false;
  return true;
}
