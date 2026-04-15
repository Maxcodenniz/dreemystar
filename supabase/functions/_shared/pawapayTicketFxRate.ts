/**
 * Market-aligned USD → XOF for ticket PawaPay checkout only (WAEMU: EUR peg × ECB USD/EUR via Frankfurter).
 * Cached in app_config 24h; any failure falls back to getPawapayUsdToLocalRate() so payment page still works.
 */
import { getPawapayLocalCurrencyLabel, getPawapayUsdToLocalRate } from "./pawapaySessionHelpers.ts";

const CACHE_KEY = "pawapay_ticket_fx_cache";
const TTL_MS = 24 * 60 * 60 * 1000;
/** BCEAO: XOF per 1 EUR (fixed peg). */
const EUR_TO_XOF_PEG = 655.957;
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=EUR";

type FxCacheRow = {
  rate?: number;
  fetched_at?: string;
};

function parseCache(value: unknown): { rate: number; fetchedAt: number } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as FxCacheRow;
  const rate = typeof o.rate === "number" ? o.rate : parseFloat(String(o.rate));
  const raw = o.fetched_at;
  if (!raw || typeof raw !== "string") return null;
  const fetchedAt = Date.parse(raw);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(fetchedAt)) return null;
  return { rate, fetchedAt };
}

async function fetchUsdToXofFromFrankfurter(): Promise<number> {
  const res = await fetch(FRANKFURTER_URL, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status}`);
  }
  const j = (await res.json()) as { rates?: { EUR?: number } };
  const eurPerUsd = j.rates?.EUR;
  if (typeof eurPerUsd !== "number" || !Number.isFinite(eurPerUsd) || eurPerUsd <= 0) {
    throw new Error("Frankfurter: missing USD→EUR rate");
  }
  return eurPerUsd * EUR_TO_XOF_PEG;
}

// deno-lint-ignore no-explicit-any
export async function resolveTicketUsdToLocalRate(supabase: any): Promise<number> {
  const local = getPawapayLocalCurrencyLabel();
  if (local !== "XOF") {
    return getPawapayUsdToLocalRate();
  }

  try {
    const { data: row } = await supabase.from("app_config").select("value").eq("key", CACHE_KEY).maybeSingle();
    const cached = parseCache(row?.value);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached.rate;
    }
  } catch (e) {
    console.warn("[pawapay-ticket-fx] cache read failed", e);
  }

  try {
    const rate = await fetchUsdToXofFromFrankfurter();
    const fetched_at = new Date().toISOString();
    const { error: upErr } = await supabase.from("app_config").upsert(
      {
        key: CACHE_KEY,
        value: { rate, fetched_at },
        description: "Cached USD→XOF for PawaPay tickets (Frankfurter ECB × EUR peg); max age 24h",
      },
      { onConflict: "key" },
    );
    if (upErr) {
      console.warn("[pawapay-ticket-fx] cache write failed", upErr);
    }
    return rate;
  } catch (e) {
    console.warn("[pawapay-ticket-fx] fetch failed, using env/static fallback", e);
    return getPawapayUsdToLocalRate();
  }
}
