/** In-memory cache: key = currency ISO, value = { rate, expiresAt } */
const cache = new Map<string, { rate: number; expiresAt: number }>();
const ONE_HOUR_MS = 60 * 60 * 1000;
/** WAEMU & CEMAC CFA francs per 1 EUR (ECB). */
const EUR_TO_CFA_PEG = 655.957;

const BASE = 'https://api.frankfurter.dev/v1/latest';
const OPEN_ER_API = 'https://open.er-api.com/v6/latest/USD';

async function fetchOpenErUsdRate(currency: string): Promise<number> {
  const c = currency.trim().toUpperCase();
  const res = await fetch(OPEN_ER_API);
  if (!res.ok) throw new Error('Exchange rate request failed');
  const j = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (j.result !== 'success' || !j.rates) throw new Error('Exchange rate data invalid');
  const r = j.rates[c];
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
    throw new Error(`No rate for ${c}`);
  }
  return r;
}

/**
 * Live USD→currency rate. XOF/XAF: ECB USD/EUR × EUR→CFA peg. Frankfurter (ECB) has few African pairs;
 * falls back to open.er-api for other ISO 4217 codes.
 */
export async function fetchFrankfurterUsdRate(currencyCode: string): Promise<number> {
  const c = currencyCode.trim().toUpperCase();
  const now = Date.now();
  const hit = cache.get(c);
  if (hit && hit.expiresAt > now) {
    return hit.rate;
  }

  if (c === 'XOF' || c === 'XAF') {
    const res = await fetch(`${BASE}?from=USD&to=EUR`);
    if (!res.ok) throw new Error('Frankfurter request failed');
    const j = (await res.json()) as { rates?: { EUR?: number } };
    const eurPerUsd = j.rates?.EUR;
    if (typeof eurPerUsd !== 'number' || !Number.isFinite(eurPerUsd) || eurPerUsd <= 0) {
      throw new Error('Missing EUR rate');
    }
    const rate = eurPerUsd * EUR_TO_CFA_PEG;
    cache.set(c, { rate, expiresAt: now + ONE_HOUR_MS });
    return rate;
  }

  const res = await fetch(`${BASE}?from=USD&to=${encodeURIComponent(c)}`);
  if (res.ok) {
    const j = (await res.json()) as { rates?: Record<string, number> };
    const r = j.rates?.[c];
    if (typeof r === 'number' && Number.isFinite(r) && r > 0) {
      cache.set(c, { rate: r, expiresAt: now + ONE_HOUR_MS });
      return r;
    }
  }

  const rate = await fetchOpenErUsdRate(c);
  cache.set(c, { rate, expiresAt: now + ONE_HOUR_MS });
  return rate;
}
