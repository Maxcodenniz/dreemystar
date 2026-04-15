import { supabase } from '../lib/supabaseClient';

export type MobileMoneyCapabilitiesPayload = {
  pawapay: Record<string, string[]>;
  dusupay: Record<string, string[]>;
  dusupayProviderCodes: Record<string, Record<string, string>>;
  stale: { pawapay: boolean; dusupay: boolean };
  fetchedAt: { pawapay: string | null; dusupay: string | null };
  ttlMs: number;
  countries: string[];
};

export async function fetchMobileMoneyCapabilities(): Promise<{
  data: MobileMoneyCapabilitiesPayload | null;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('get-mobile-money-capabilities', {
    body: {},
  });
  if (error) {
    return { data: null, error: error.message || 'Could not load mobile money options.' };
  }
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: string }).error === 'string') {
    return { data: null, error: (data as { error: string }).error };
  }
  return { data: data as MobileMoneyCapabilitiesPayload, error: null };
}

/** Union of operators shown for a country (any provider). */
export function operatorsForCountry(
  cap: MobileMoneyCapabilitiesPayload | null,
  countryCode: string,
): string[] {
  if (!cap || !countryCode) return [];
  const cc = countryCode.trim().toUpperCase().slice(0, 2);
  const set = new Set<string>();
  for (const o of cap.pawapay[cc] ?? []) set.add(o);
  for (const o of cap.dusupay[cc] ?? []) set.add(o);
  return [...set].sort((a, b) => a.localeCompare(b));
}
