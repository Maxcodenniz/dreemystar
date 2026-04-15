/**
 * localStorage wrapper that never throws (Safari / embedded WebViews / sandboxed
 * contexts can throw DOMException "The operation is insecure.").
 * Use for Zustand persist and Supabase auth storage so payment return flows don't crash.
 */
export const safeLocalStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore — quota, private mode, insecure context */
    }
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
