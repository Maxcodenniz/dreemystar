import type { AdminToggles, CapabilityFreshness, MobileMoneyAggregator, MobileMoneyCapabilityCache } from "./types.ts";
import { MobileMoneyError, MobileMoneyTemporarilyUnavailableError, UnsupportedOperatorOrCountryError } from "./errors.ts";

/** Normalize operator label for comparisons (e.g. AirtelTigo → AIRTELTIGO). */
export function normalizeOperatorKey(operator: string): string {
  return operator.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalize to ISO 3166-1 alpha-2 uppercase. */
export function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

export function isCountrySupported(
  provider: MobileMoneyAggregator,
  countryCode: string,
  cache: MobileMoneyCapabilityCache,
): boolean {
  const map = provider === "pawapay" ? cache.pawapay : cache.dusupay;
  if (!map) return false;
  const cc = normalizeCountryCode(countryCode);
  if (cc.length !== 2) return false;
  const ops = map[cc];
  return Array.isArray(ops) && ops.length > 0;
}

export function isOperatorSupported(
  provider: MobileMoneyAggregator,
  countryCode: string,
  operator: string,
  cache: MobileMoneyCapabilityCache,
): boolean {
  const map = provider === "pawapay" ? cache.pawapay : cache.dusupay;
  if (!map) return false;
  const cc = normalizeCountryCode(countryCode);
  if (cc.length !== 2) return false;
  const ops = map[cc];
  if (!Array.isArray(ops) || ops.length === 0) return false;
  const want = normalizeOperatorKey(operator);
  if (!want) return false;
  return ops.some((o) => normalizeOperatorKey(o) === want);
}

function providerDataUsable(
  map: MobileMoneyCapabilityCache["pawapay"],
  fresh: boolean,
): boolean {
  return fresh && map !== null && typeof map === "object" && Object.keys(map).length > 0;
}

/**
 * Decide PawaPay vs DusuPay from user-selected country + operator, toggles, and cached capabilities.
 * Side-effect free. PawaPay wins when both support the pair.
 */
export function getMobileMoneyProvider(
  countryCode: string,
  operator: string,
  toggles: AdminToggles,
  cache: MobileMoneyCapabilityCache,
  freshness: CapabilityFreshness,
): MobileMoneyAggregator {
  const cc = normalizeCountryCode(countryCode);
  if (cc.length !== 2) {
    throw new MobileMoneyError("BAD_COUNTRY", "Invalid country code (expected ISO 3166-1 alpha-2).");
  }
  if (!operator?.trim()) {
    throw new MobileMoneyError("BAD_OPERATOR", "Mobile network operator is required.");
  }

  if (!toggles.mobileMoneyEnabled || (!toggles.isPawaPayEnabled && !toggles.isDusuPayEnabled)) {
    throw new MobileMoneyTemporarilyUnavailableError();
  }

  const pPawa = toggles.isPawaPayEnabled && providerDataUsable(cache.pawapay, freshness.pawapayFresh);
  const pDusu = toggles.isDusuPayEnabled && providerDataUsable(cache.dusupay, freshness.dusupayFresh);

  if (!pPawa && !pDusu) {
    throw new MobileMoneyTemporarilyUnavailableError();
  }

  const pOk = pPawa && isOperatorSupported("pawapay", cc, operator, cache);
  const dOk = pDusu && isOperatorSupported("dusupay", cc, operator, cache);

  if (toggles.isPawaPayEnabled && toggles.isDusuPayEnabled) {
    if (pOk) return "pawapay";
    if (dOk) return "dusupay";
    if (!pPawa && !pDusu) {
      throw new MobileMoneyTemporarilyUnavailableError();
    }
    throw new UnsupportedOperatorOrCountryError();
  }

  if (toggles.isPawaPayEnabled) {
    if (pOk) return "pawapay";
    throw new UnsupportedOperatorOrCountryError();
  }

  if (toggles.isDusuPayEnabled) {
    if (dOk) return "dusupay";
    throw new UnsupportedOperatorOrCountryError();
  }

  throw new MobileMoneyTemporarilyUnavailableError();
}
