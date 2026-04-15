import { pawapayMinorDecimalPlacesForCurrency } from "./pawapaySessionHelpers.ts";

/** Server-side USD→local rate (must match client `frankfurterRate.ts`). */
const EUR_TO_CFA_PEG = 655.957;
const BASE = "https://api.frankfurter.dev/v1/latest";
const OPEN_ER_API = "https://open.er-api.com/v6/latest/USD";

function formatValidatedServerAmount(expectedNum: number, currency: string): string {
  const dp = pawapayMinorDecimalPlacesForCurrency(currency);
  if (dp === 0) return String(Math.round(expectedNum));
  const mult = 10 ** dp;
  const v = Math.round(expectedNum * mult) / mult;
  return v.toFixed(dp);
}

async function fetchOpenErUsdRate(currency: string): Promise<number> {
  const c = currency.trim().toUpperCase();
  const res = await fetch(OPEN_ER_API);
  if (!res.ok) throw new Error("OpenER failed");
  const j = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (j.result !== "success" || !j.rates) throw new Error("OpenER invalid");
  const r = j.rates[c];
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) throw new Error(`No rate for ${c}`);
  return r;
}

export async function fetchUsdToCurrencyRateServer(currency: string): Promise<number> {
  const c = currency.trim().toUpperCase();
  if (c === "XOF" || c === "XAF") {
    const res = await fetch(`${BASE}?from=USD&to=EUR`);
    if (!res.ok) throw new Error("Frankfurter failed");
    const j = (await res.json()) as { rates?: { EUR?: number } };
    const eur = j.rates?.EUR;
    if (typeof eur !== "number" || !Number.isFinite(eur) || eur <= 0) throw new Error("No EUR rate");
    return eur * EUR_TO_CFA_PEG;
  }

  const res = await fetch(`${BASE}?from=USD&to=${encodeURIComponent(c)}`);
  if (res.ok) {
    const j = (await res.json()) as { rates?: Record<string, number> };
    const r = j.rates?.[c];
    if (typeof r === "number" && Number.isFinite(r) && r > 0) return r;
  }

  return await fetchOpenErUsdRate(c);
}

export async function validateClientPawapayAmount(
  totalUsd: number,
  clientAmountStr: string,
  currency: string,
): Promise<{ ok: true; serverAmount: string } | { ok: false; error: string }> {
  let rate: number;
  try {
    rate = await fetchUsdToCurrencyRateServer(currency);
  } catch {
    return { ok: false, error: "Could not verify exchange rate. Please try again." };
  }
  const expectedNum = totalUsd * rate;
  const serverAmount = formatValidatedServerAmount(expectedNum, currency);
  const client = parseFloat(clientAmountStr);
  const exp = parseFloat(serverAmount);
  const tol = pawapayMinorDecimalPlacesForCurrency(currency) === 0
    ? 1 + Math.abs(exp) * 0.002
    : 0.05 + Math.abs(exp) * 0.002;
  if (!Number.isFinite(client) || Math.abs(client - exp) > tol) {
    return { ok: false, error: "Payment amount does not match current price." };
  }
  return { ok: true, serverAmount };
}
