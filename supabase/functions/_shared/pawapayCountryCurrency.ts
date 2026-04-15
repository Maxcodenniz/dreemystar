/**
 * ISO 3166-1 alpha-3 → primary ISO 4217 currency for PawaPay mobile-money corridors.
 * WAEMU/CEMAC and similar share regional units (XOF / XAF).
 */
export const PAWAPAY_ALPHA3_TO_ISO4217: Record<string, string> = {
  BEN: "XOF",
  BFA: "XOF",
  CIV: "XOF",
  GNB: "XOF",
  MLI: "XOF",
  NER: "XOF",
  SEN: "XOF",
  TGO: "XOF",
  GHA: "GHS",
  NGA: "NGN",
  KEN: "KES",
  UGA: "UGX",
  TZA: "TZS",
  ZMB: "ZMW",
  ZWE: "USD",
  RWA: "RWF",
  ZAF: "ZAR",
  EGY: "EGP",
  MAR: "MAD",
  TUN: "TND",
  DZA: "DZD",
  LBY: "LYD",
  ETH: "ETB",
  SDN: "SDG",
  SSD: "SSP",
  SOM: "SOS",
  DJI: "DJF",
  ERI: "ERN",
  MUS: "MUR",
  MDG: "MGA",
  MWI: "MWK",
  MOZ: "MZN",
  NAM: "NAD",
  BWA: "BWP",
  SWZ: "SZL",
  LSO: "LSL",
  AGO: "AOA",
  CAF: "XAF",
  CMR: "XAF",
  COG: "XAF",
  GAB: "XAF",
  GNQ: "XAF",
  TCD: "XAF",
  STP: "STN",
  CPV: "CVE",
  GIN: "GNF",
  SLE: "SLE",
  LBR: "LRD",
  COD: "CDF",
  COM: "KMF",
  REU: "EUR",
  MYT: "EUR",
  SHN: "SHP",
};

export function pawapayCurrencyForCountry(alpha3: string): string | null {
  const k = alpha3.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (k.length !== 3) return null;
  return PAWAPAY_ALPHA3_TO_ISO4217[k] ?? null;
}

/**
 * USD→local conversion needs an ISO 3166-1 alpha-3 corridor. When the client does not send country,
 * we still convert using a baseline (env or allowlist). Pass `sessionCountry` to PawaPay only when the
 * customer’s country is known or the merchant allowlist has a single country — otherwise omit `country`
 * so the Payment Page lets the customer choose.
 */
export function resolvePawapayFxAlpha3AndSessionCountry(
  resolvedAlpha3: string | null,
  allowedSet: Set<string>,
): { fxAlpha3: string; sessionCountry: string | undefined } {
  const sorted = [...allowedSet].sort();
  if (sorted.length === 0) {
    return { fxAlpha3: "BEN", sessionCountry: undefined };
  }
  if (resolvedAlpha3 && allowedSet.has(resolvedAlpha3)) {
    return { fxAlpha3: resolvedAlpha3, sessionCountry: resolvedAlpha3 };
  }
  if (allowedSet.size === 1) {
    const only = sorted[0]!;
    return { fxAlpha3: only, sessionCountry: only };
  }
  const raw = Deno.env.get("PAWAPAY_DEFAULT_CHECKOUT_ALPHA3")?.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const fromEnv = raw && raw.length === 3 && allowedSet.has(raw) ? raw : null;
  const fxAlpha3 = (fromEnv ?? sorted.find((c) => c === "BEN") ?? sorted[0])!;
  return { fxAlpha3, sessionCountry: undefined };
}
