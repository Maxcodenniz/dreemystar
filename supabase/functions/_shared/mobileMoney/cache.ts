import { CAPABILITY_TTL_MS, type CapabilityFreshness, type CapabilitySnapshotRow, type CountryOperatorsMap, type MobileMoneyCapabilityCache } from "./types.ts";

function parseCountryOperatorsMap(v: unknown): CountryOperatorsMap | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: CountryOperatorsMap = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const cc = k.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    if (cc.length !== 2) continue;
    if (!Array.isArray(val)) continue;
    const ops = val
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim());
    if (ops.length) out[cc] = ops;
  }
  return Object.keys(out).length ? out : null;
}

function parseDusupayCodes(v: unknown): Record<string, Record<string, string>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [iso2, inner] of Object.entries(v as Record<string, unknown>)) {
    const cc = iso2.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    if (cc.length !== 2 || !inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    const m: Record<string, string> = {};
    for (const [opKey, code] of Object.entries(inner as Record<string, unknown>)) {
      if (typeof opKey === "string" && typeof code === "string" && code.trim()) {
        m[opKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")] = code.trim();
      }
    }
    if (Object.keys(m).length) out[cc] = m;
  }
  return out;
}

/** Build in-memory cache + freshness from a DB snapshot row. */
export function rowToCapabilityCache(row: CapabilitySnapshotRow): MobileMoneyCapabilityCache {
  return {
    pawapay: parseCountryOperatorsMap(row.pawapay),
    dusupay: parseCountryOperatorsMap(row.dusupay),
    dusupayProviderCodes: parseDusupayCodes(row.dusupay_provider_codes),
  };
}

export function buildFreshness(
  row: CapabilitySnapshotRow,
  nowMs: number,
  ttlMs: number = CAPABILITY_TTL_MS,
): CapabilityFreshness {
  const pAt = row.pawapay_fetched_at ? Date.parse(row.pawapay_fetched_at) : NaN;
  const dAt = row.dusupay_fetched_at ? Date.parse(row.dusupay_fetched_at) : NaN;
  return {
    pawapayFresh: Number.isFinite(pAt) && nowMs - pAt < ttlMs,
    dusupayFresh: Number.isFinite(dAt) && nowMs - dAt < ttlMs,
    nowMs,
  };
}

const EMPTY_ROW: CapabilitySnapshotRow = {
  pawapay: {},
  dusupay: {},
  dusupay_provider_codes: {},
  pawapay_fetched_at: null,
  dusupay_fetched_at: null,
};

/** Read normalized cache + freshness from a snapshot row (pure). */
export function getCapabilities(row: CapabilitySnapshotRow | null, nowMs: number = Date.now()) {
  const r = row ?? EMPTY_ROW;
  return {
    cache: rowToCapabilityCache(r),
    freshness: buildFreshness(r, nowMs),
  };
}
