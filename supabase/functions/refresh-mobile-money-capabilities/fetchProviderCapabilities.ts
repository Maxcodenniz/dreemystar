/**
 * Fetches raw capability payloads from PawaPay and DusuPay HTTP APIs.
 * Lives inside this function folder so Supabase's deploy bundler includes it
 * (parent `../_shared` is not uploaded per-function on hosted deploy).
 */

function normalizeOperatorKey(operator: string): string {
  return operator.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** PawaPay uses ISO 3166-1 alpha-3; router/UI use alpha-2. */
const ALPHA3_TO_ISO2: Record<string, string> = {
  GHA: "GH", KEN: "KE", UGA: "UG", NGA: "NG", ZMB: "ZM", RWA: "RW", TZA: "TZ", SEN: "SN",
  CIV: "CI", CMR: "CM", BFA: "BF", MLI: "ML", NER: "NE", TGO: "TG", BEN: "BJ",
  COD: "CD", COG: "CG", ZAF: "ZA", EGY: "EG", MAR: "MA", TUN: "TN", DZA: "DZ",
  GIN: "GN", GNB: "GW", LBR: "LR", SLE: "SL", GMB: "GM", MUS: "MU", BWA: "BW",
  NAM: "NA", LSO: "LS", SWZ: "SZ", MOZ: "MZ", MDG: "MG", ZWE: "ZW", MWI: "MW",
  AGO: "AO", ETH: "ET", SDN: "SD", SSD: "SS", SOM: "SO", DJI: "DJ", ERI: "ER",
  TCD: "TD", CAF: "CF", GAB: "GA", GNQ: "GQ", STP: "ST", CPV: "CV", COM: "KM",
  SYC: "SC", REU: "RE", MYT: "YT", SHN: "SH",
};

function alpha3ToIso2(alpha3: string): string | null {
  const a = alpha3.trim().toUpperCase();
  return ALPHA3_TO_ISO2[a] ?? null;
}

/** Map PawaPay provider id to canonical operator label for UI/router. */
export function pawapayProviderToOperatorLabel(provider: string): string {
  const u = provider.toUpperCase();
  if (u.includes("MPESA") || u.includes("SAFARICOM")) return "Safaricom";
  if (u.includes("AIRTELTIGO")) return "AirtelTigo";
  if (u.startsWith("MTN")) return "MTN";
  if (u.startsWith("VODAFONE")) return "Vodafone";
  if (u.startsWith("AIRTEL")) return "Airtel";
  if (u.includes("TIGOPESA") || u.includes("TIGO_")) return "Tigo";
  if (u.includes("VODACOM")) return "Vodacom";
  if (u.includes("ORANGE")) return "Orange";
  if (u.includes("ZAMTEL")) return "Zamtel";
  if (u.includes("MOOV")) return "Moov";
  const first = u.split("_")[0] ?? u;
  return first.charAt(0) + first.slice(1).toLowerCase();
}

type PawapayAvailabilityRow = {
  country: string;
  providers: Array<{
    provider: string;
    operationTypes: Array<{ operationType: string; status: string }>;
  }>;
};

/** PawaPay usually returns operationTypes as an array; some payloads use a map keyed by type. */
function pawapayDepositIsOperational(operationTypes: unknown): boolean {
  if (operationTypes == null) return false;
  if (Array.isArray(operationTypes)) {
    const hit = operationTypes.find((o) => {
      if (!o || typeof o !== "object" || Array.isArray(o)) return false;
      return (o as { operationType?: string }).operationType === "DEPOSIT";
    }) as { status?: string } | undefined;
    return hit?.status === "OPERATIONAL";
  }
  if (typeof operationTypes === "object" && !Array.isArray(operationTypes)) {
    const rec = operationTypes as Record<string, unknown>;
    const dep = rec.DEPOSIT ?? rec.deposit;
    if (dep != null && typeof dep === "object" && !Array.isArray(dep)) {
      return (dep as { status?: string }).status === "OPERATIONAL";
    }
    if (typeof dep === "string") {
      return dep === "OPERATIONAL";
    }
  }
  return false;
}

export async function fetchPawapayCapabilities(args: {
  baseUrl: string;
  apiToken: string;
}): Promise<{ map: Record<string, string[]>; error?: string }> {
  const url = `${args.baseUrl.replace(/\/+$/, "")}/v2/availability?operationType=DEPOSIT`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${args.apiToken}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const t = await res.text();
      return { map: {}, error: `PawaPay availability HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as PawapayAvailabilityRow[] | { failureReason?: unknown };
    if (!Array.isArray(data)) {
      return { map: {}, error: "PawaPay availability: unexpected JSON shape" };
    }
    const byCountry: Record<string, Set<string>> = {};
    for (const row of data) {
      const iso2 = alpha3ToIso2(row.country);
      if (!iso2) continue;
      const provList = Array.isArray(row.providers) ? row.providers : [];
      for (const p of provList) {
        if (!pawapayDepositIsOperational(p.operationTypes)) continue;
        const label = pawapayProviderToOperatorLabel(p.provider);
        if (!byCountry[iso2]) byCountry[iso2] = new Set();
        byCountry[iso2].add(label);
      }
    }
    const map: Record<string, string[]> = {};
    for (const [k, set] of Object.entries(byCountry)) {
      map[k] = [...set].sort();
    }
    return { map };
  } catch (e) {
    return { map: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

type DusuPayQuery = { currency: string; country_code: string };

/** Build absolute URL; rejects bad DUSUPAY_API_BASE (e.g. truncated secret showing as `b`). */
function dusupayPaymentProvidersUrl(apiBase: string, q: DusuPayQuery): string {
  const raw = apiBase.trim().replace(/\/+$/, "");
  if (!raw || !/^https?:\/\//i.test(raw)) {
    throw new Error(
      "DUSUPAY_API_BASE must be a full URL (e.g. https://sandboxapi.dusupay.com). Check Edge Function secrets.",
    );
  }
  const origin = new URL(raw);
  const u = new URL("/data/payment-providers", origin);
  u.searchParams.set("currency", q.currency);
  u.searchParams.set("transaction_type", "COLLECTION");
  u.searchParams.set("country_code", q.country_code);
  return u.href;
}

function dusupayProviderToOperatorLabel(providerCode: string, providerName: string): string {
  const code = providerCode.toLowerCase();
  const name = providerName.toLowerCase();
  if (code.startsWith("mtn")) return "MTN";
  if (code.startsWith("vodafone") || name.includes("vodafone")) return "Vodafone";
  if (code.startsWith("airtel")) return "Airtel";
  if (code.includes("safaricom") || name.includes("m-pesa") || name.includes("mpesa")) return "Safaricom";
  if (code.includes("tigo") || name.includes("tigo")) return "Tigo";
  if (code.includes("vodacom") || name.includes("vodacom")) return "Vodacom";
  if (code.includes("orange") || name.includes("orange")) return "Orange";
  if (code.includes("zamtel") || name.includes("zamtel")) return "Zamtel";
  const seg = providerCode.split("_")[0] ?? providerCode;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
}

export async function fetchDusupayCapabilities(args: {
  apiBase: string;
  publicKey: string;
  /** If empty, uses a small default set of currency/country pairs. */
  queries: DusuPayQuery[];
}): Promise<{
  map: Record<string, string[]>;
  providerCodes: Record<string, Record<string, string>>;
  error?: string;
}> {
  const queries = args.queries.length
    ? args.queries
    : [
        { currency: "UGX", country_code: "UG" },
        { currency: "GHS", country_code: "GH" },
        { currency: "KES", country_code: "KE" },
        { currency: "TZS", country_code: "TZ" },
        { currency: "RWF", country_code: "RW" },
        { currency: "ZMW", country_code: "ZM" },
        { currency: "XAF", country_code: "CM" },
      ];

  const opByCountry: Record<string, Set<string>> = {};
  const codesByCountry: Record<string, Record<string, string>> = {};

  const errors: string[] = [];
  try {
    for (const q of queries) {
      const url = dusupayPaymentProvidersUrl(args.apiBase, q);
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-api-version": "1",
          "public-key": args.publicKey,
          // Some CDNs return 502/HTML for requests with no User-Agent (e.g. server-to-server).
          "User-Agent": "DreemyStar-capability-refresh/1.0",
        },
      });
      if (!res.ok) {
        const t = await res.text();
        errors.push(`${q.country_code}/${q.currency}: HTTP ${res.status} ${t.slice(0, 120)}`);
        continue;
      }
      const json = (await res.json()) as {
        data?: { payment_providers?: Array<{
          provider_name?: string;
          provider_code?: string;
          transaction_method?: string;
          is_active?: boolean;
        }> };
      };
      const list = json.data?.payment_providers ?? [];
      const cc = q.country_code.trim().toUpperCase().slice(0, 2);
      for (const pp of list) {
        if (pp.transaction_method !== "MOBILE_MONEY" || pp.is_active === false) continue;
        const code = pp.provider_code?.trim();
        const pname = pp.provider_name ?? "";
        if (!code) continue;
        const label = dusupayProviderToOperatorLabel(code, pname);
        if (!opByCountry[cc]) opByCountry[cc] = new Set();
        opByCountry[cc].add(label);
        const key = normalizeOperatorKey(label);
        if (!codesByCountry[cc]) codesByCountry[cc] = {};
        codesByCountry[cc][key] = code;
      }
    }

    const map: Record<string, string[]> = {};
    for (const [k, set] of Object.entries(opByCountry)) {
      map[k] = [...set].sort();
    }
    return {
      map,
      providerCodes: codesByCountry,
      error: Object.keys(map).length === 0 && errors.length ? errors.join("; ") : undefined,
    };
  } catch (e) {
    return {
      map: {},
      providerCodes: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Parse JSON env `DUSUPAY_CAPABILITY_QUERIES` as `[{currency,country_code},...]`. */
export function parseDusupayQueriesFromEnv(raw: string | undefined): DusuPayQuery[] {
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => x as Record<string, string>)
      .filter((x) => x && typeof x.currency === "string" && typeof x.country_code === "string")
      .map((x) => ({ currency: x.currency, country_code: x.country_code }));
  } catch {
    return [];
  }
}
