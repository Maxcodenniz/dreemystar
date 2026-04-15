import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { validateClientPawapayAmount } from "../_shared/frankfurterUsdRate.ts";
import { resolveTicketUsdToLocalRate } from "../_shared/pawapayTicketFxRate.ts";
import {
  clampPawapayPaymentReason,
  formatPawapayAmountFromSiteTotal,
  getPawapayLocalCurrencyLabel,
  normalizePawapayReturnUrl,
  pawapayInitiationErrorMessage,
  pawapayTicketPaymentReason,
  postPawapayV1WidgetSession,
  resolvePawapayReturnBase,
  type PawapayV1SessionMetadataItem,
} from "../_shared/pawapaySessionHelpers.ts";

function jsonbTruthy(v: unknown): boolean {
  return v === true || v === "true";
}

// deno-lint-ignore no-explicit-any
async function readPaymentToggles(supabase: any) {
  const { data, error } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["mobile_money_payments_enabled", "pawapay_enabled", "dusupay_enabled"]);

  if (error || !data?.length) {
    return { mobileMoney: false, pawapay: false, dusupay: false };
  }
  const map = new Map(data.map((r) => [r.key as string, r.value]));
  return {
    mobileMoney: jsonbTruthy(map.get("mobile_money_payments_enabled")),
    pawapay: jsonbTruthy(map.get("pawapay_enabled")),
    dusupay: jsonbTruthy(map.get("dusupay_enabled")),
  };
}

function pawapayForbiddenResponse(): Response {
  return new Response(JSON.stringify({ error: "Pawapay payments are disabled for this platform." }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function breakdownFromBaseTotal(baseTotal: number) {
  const subtotalCents = Math.round(baseTotal * 100);
  const totalCents = Math.round(baseTotal * 1.25 * 100);
  const serviceCents = Math.round(baseTotal * 0.05 * 100);
  const vatCents = totalCents - subtotalCents - serviceCents;
  return {
    subtotal: subtotalCents / 100,
    serviceFee: serviceCents / 100,
    vat: vatCents / 100,
    total: totalCents / 100,
  };
}

/** ISO 3166-1 alpha-2 → alpha-3 (Africa-focused; extend as needed). */
const ISO2_TO_ALPHA3: Record<string, string> = {
  DZ: "DZA", AO: "AGO", BJ: "BEN", BW: "BWA", BF: "BFA", BI: "BDI", CV: "CPV", CM: "CMR", CF: "CAF", TD: "TCD", KM: "COM",
  CG: "COG", CD: "COD", CI: "CIV", DJ: "DJI", EG: "EGY", GQ: "GNQ", ER: "ERI", SZ: "SWZ", ET: "ETH", GA: "GAB", GM: "GMB", GH: "GHA",
  GN: "GIN", GW: "GNB", KE: "KEN", LS: "LSO", LR: "LBR", LY: "LBY", MG: "MDG", MW: "MWI", ML: "MLI", MR: "MRT", MU: "MUS",
  MA: "MAR", MZ: "MOZ", NA: "NAM", NE: "NER", NG: "NGA", RW: "RWA", ST: "STP", SN: "SEN", SC: "SYC", SL: "SLE", SO: "SOM", ZA: "ZAF",
  SS: "SSD", SD: "SDN", TZ: "TZA", TG: "TGO", TN: "TUN", UG: "UGA", ZM: "ZMB", ZW: "ZWE", RE: "REU", YT: "MYT", SH: "SHN",
};

function buildDialPrefixes(): [string, string][] {
  const base: [string, string][] = [
    ["211", "SSD"], ["212", "MAR"], ["213", "DZA"], ["216", "TUN"], ["218", "LBY"],
    ["220", "GMB"], ["221", "SEN"], ["222", "MRT"], ["223", "MLI"], ["224", "GIN"],
    ["225", "CIV"], ["226", "BFA"], ["227", "NER"], ["228", "TGO"], ["229", "BEN"],
    ["230", "MUS"], ["231", "LBR"], ["232", "SLE"], ["233", "GHA"], ["234", "NGA"],
    ["235", "TCD"], ["236", "CAF"], ["237", "CMR"], ["238", "CPV"], ["239", "STP"],
    ["240", "GNQ"], ["241", "GAB"], ["242", "COG"], ["243", "COD"], ["244", "AGO"],
    ["245", "GNB"], ["248", "SYC"], ["249", "SDN"], ["250", "RWA"], ["251", "ETH"],
    ["252", "SOM"], ["253", "DJI"], ["254", "KEN"], ["255", "TZA"], ["256", "UGA"],
    ["257", "BDI"], ["258", "MOZ"], ["260", "ZMB"], ["261", "MDG"], ["262", "REU"],
    ["263", "ZWE"], ["264", "NAM"], ["265", "MWI"], ["266", "LSO"], ["267", "BWA"],
    ["268", "SWZ"], ["269", "COM"], ["27", "ZAF"], ["290", "SHN"], ["291", "ERI"],
  ];
  const m = new Map<string, string>();
  for (const [p, c] of base) m.set(p, c);
  const extra = Deno.env.get("PAWAPAY_DIAL_PREFIX_MAP_JSON");
  if (extra) {
    try {
      const o = JSON.parse(extra) as Record<string, string>;
      for (const k of Object.keys(o)) {
        const prefix = k.replace(/\D/g, "");
        const code = String(o[k]).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
        if (prefix.length >= 1 && code.length === 3) m.set(prefix, code);
      }
    } catch {
      /* ignore */
    }
  }
  const arr = [...m.entries()] as [string, string][];
  arr.sort((a, b) => b[0].length - a[0].length);
  return arr;
}

let _dialPrefixesCache: [string, string][] | null = null;
function dialPrefixesSorted(): [string, string][] {
  if (!_dialPrefixesCache) _dialPrefixesCache = buildDialPrefixes();
  return _dialPrefixesCache;
}

function codesFromJsonArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return [
    ...new Set(
      arr
        .map((x) => String(x).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))
        .filter((c) => c.length === 3),
    ),
  ];
}

/** Parse allowlist: strict JSON array first, then comma / semicolon separated (common in secret UIs). */
function loadPawapayAllowedCodes(): string[] {
  const raw = Deno.env.get("PAWAPAY_ALLOWED_COUNTRIES")?.trim();
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const fromJson = codesFromJsonArray(parsed);
      if (fromJson.length) return fromJson;
    } catch {
      /* not valid JSON — try relaxed formats */
    }

    const stripped = raw.replace(/^\uFEFF/, "").replace(/^\[/, "").replace(/\]$/, "").trim();
    const pieces = stripped.split(/[,;]+/).map((s) => s.trim().replace(/^["']+|["']+$/g, ""));
    const fromDelimited = [
      ...new Set(
        pieces
          .map((s) => s.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))
          .filter((c) => c.length === 3),
      ),
    ];
    if (fromDelimited.length) return fromDelimited;

    throw new Error(
      "PAWAPAY_ALLOWED_COUNTRIES: use JSON array [\"GHA\",\"KEN\"] or comma-separated codes GHA,KEN,UGA (ISO 3166-1 alpha-3)",
    );
  }
  const single = Deno.env.get("PAWAPAY_PAYMENT_COUNTRY")?.trim().toUpperCase();
  if (single && single.length === 3) return [single];
  throw new Error(
    "Set PAWAPAY_ALLOWED_COUNTRIES (JSON array or GHA,KEN,UGA) or PAWAPAY_PAYMENT_COUNTRY (single alpha-3)",
  );
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** English / common profile labels → alpha-3 (letters-only key). */
const COUNTRY_NAME_COMPACT_TO_ALPHA3: Record<string, string> = {
  GHANA: "GHA", SENEGAL: "SEN", NIGERIA: "NGA", KENYA: "KEN", UGANDA: "UGA", RWANDA: "RWA", TANZANIA: "TZA",
  ZAMBIA: "ZMB", CAMEROON: "CMR", BURKINAFASO: "BFA", MALI: "MLI", NIGER: "NER", BENIN: "BEN", TOGO: "TGO",
  GABON: "GAB", GUINEA: "GIN", GUINEABISSAU: "GNB", SIERRALEONE: "SLE", LIBERIA: "LBR", COTEDIVOIRE: "CIV",
  IVORYCOAST: "CIV", SOUTHAFRICA: "ZAF", SOUTHSUDAN: "SSD", ETHIOPIA: "ETH", EGYPT: "EGY", MOROCCO: "MAR",
  TUNISIA: "TUN", ALGERIA: "DZA", MOZAMBIQUE: "MOZ", ZIMBABWE: "ZWE", BOTSWANA: "BWA", NAMIBIA: "NAM",
  MALAWI: "MWI", LESOTHO: "LSO", ESWATINI: "SWZ", SWAZILAND: "SWZ", ANGOLA: "AGO", MAURITIUS: "MUS",
  SOMALIA: "SOM", DJIBOUTI: "DJI", CHAD: "TCD", GAMBIA: "GMB", CAPEVERDE: "CPV", ERITREA: "ERI", MADAGASCAR: "MDG",
  BURUNDI: "BDI", EQUATORIALGUINEA: "GNQ", SAOTOMEANDPRINCIPE: "STP", SAOTOME: "STP", PRINCIPE: "STP",
  REPUBLICCONGO: "COG", DEMCONGO: "COD", DRC: "COD", CONGODR: "COD", CONGOKINSHASA: "COD", CONGOBRAZZAVILLE: "COG",
};

function normalizeCountryHint(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return null;
  const fromName = COUNTRY_NAME_COMPACT_TO_ALPHA3[s];
  if (fromName) return fromName;
  if (s.length === 3) return s;
  if (s.length === 2 && ISO2_TO_ALPHA3[s]) return ISO2_TO_ALPHA3[s];
  return null;
}

function alpha3FromE164Digits(digits: string, prefixes: [string, string][]): string | null {
  if (digits.length < 3) return null;
  for (const [p, c] of prefixes) {
    if (digits.startsWith(p)) return c;
  }
  return null;
}

function resolvePawapayPaymentCountry(
  body: Record<string, unknown>,
  phone: string,
  allowed: Set<string>,
  profileCountryAlpha3: string | null,
): { ok: true; country: string | null } | { ok: false; error: string } {
  const prefixes = dialPrefixesSorted();
  for (const key of [
    "countryCode",
    "mobileMoneyCountry",
    "mobile_money_country",
    "country",
    "paymentCountry",
    "payment_country",
    "paymentCountryAlpha3",
  ] as const) {
    const a3 = normalizeCountryHint(body[key]);
    if (a3) {
      if (allowed.has(a3)) return { ok: true, country: a3 };
      return { ok: false, error: `Country ${a3} is not enabled for Pawapay on this platform.` };
    }
  }

  if (profileCountryAlpha3 && allowed.has(profileCountryAlpha3)) {
    return { ok: true, country: profileCountryAlpha3 };
  }

  const dialRaw = body.dialCode ?? body.dial_code;
  const dialDigits = typeof dialRaw === "string" ? digitsOnly(dialRaw) : "";

  if (dialDigits.length >= 1) {
    const fromDial = alpha3FromE164Digits(dialDigits, prefixes);
    if (fromDial) {
      if (allowed.has(fromDial)) return { ok: true, country: fromDial };
      return { ok: false, error: `This dial code's region (${fromDial}) is not enabled for Pawapay on this platform.` };
    }
  }

  const phoneDigits = digitsOnly(phone);
  const localDigits =
    typeof body.localNumber === "string" ? digitsOnly(body.localNumber)
    : typeof body.local_number === "string" ? digitsOnly(body.local_number)
    : "";

  const tryPhoneDigits = (digits: string): { ok: true; country: string } | { ok: false; error: string } | null => {
    if (digits.length < 8) return null;
    const a3 = alpha3FromE164Digits(digits, prefixes);
    if (!a3) return null;
    if (allowed.has(a3)) return { ok: true, country: a3 };
    return { ok: false, error: `This phone number's country (${a3}) is not enabled for Pawapay on this platform.` };
  };

  const candidates: string[] = [];
  if (phoneDigits.length >= 8) candidates.push(phoneDigits);
  if (dialDigits.length >= 2 && phoneDigits.length >= 6 && !phoneDigits.startsWith(dialDigits)) {
    candidates.push(dialDigits + phoneDigits.replace(/^0+/, ""));
  }
  if (dialDigits.length >= 2 && localDigits.length >= 6) {
    candidates.push(dialDigits + localDigits.replace(/^0+/, ""));
  }

  const seen = new Set<string>();
  for (const cand of candidates) {
    if (seen.has(cand)) continue;
    seen.add(cand);
    const r = tryPhoneDigits(cand);
    if (r) return r;
  }

  // Omit `country` on the session so the Payment Page lets the user pick any configured country.
  return { ok: true, country: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiToken = Deno.env.get("PAWAPAY_API_TOKEN")?.trim();
    const baseUrl = (Deno.env.get("PAWAPAY_BASE_URL") || "https://api.sandbox.pawapay.io").replace(/\/+$/, "");
    if (!apiToken) {
      throw new Error("Missing PAWAPAY_API_TOKEN");
    }

    let allowedList: string[];
    try {
      allowedList = loadPawapayAllowedCodes();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pawapay country configuration error";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowedSet = new Set(allowedList);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const toggles = await readPaymentToggles(supabase);
    if (!toggles.mobileMoney || !toggles.pawapay) {
      const fr = pawapayForbiddenResponse();
      return new Response(await fr.text(), {
        status: fr.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let authenticatedUserId: string | null = null;
    let authenticatedUserEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (!userError && user) {
          authenticatedUserId = user.id;
          authenticatedUserEmail = user.email ?? null;
        }
      } catch {
        // guest checkout
      }
    }

    const rawBody = await req.json();
    const body = rawBody && typeof rawBody === "object" && rawBody.body && typeof rawBody.body === "object"
      ? rawBody.body
      : rawBody;
    const { eventId, eventIds, email, phone, name, isCart, userId, isReplay, productType } = body;
    const phoneStr = typeof phone === "string" ? phone.trim() : "";

    let profileCountryAlpha3: string | null = null;
    if (authenticatedUserId) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", authenticatedUserId)
        .maybeSingle();
      if (!profErr && prof && typeof prof.country === "string" && prof.country.trim()) {
        profileCountryAlpha3 = normalizeCountryHint(prof.country.trim());
      }
    }

    const countryRes = resolvePawapayPaymentCountry(
      body as Record<string, unknown>,
      phoneStr,
      allowedSet,
      profileCountryAlpha3,
    );
    if (!countryRes.ok) {
      return new Response(JSON.stringify({ error: countryRes.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const paymentCountry = countryRes.country;

    const bundleTypeRaw = body.bundleType ?? body.bundle_type;
    const bundleType = typeof bundleTypeRaw === "string" ? bundleTypeRaw.trim() : undefined;

    const finalUserId = authenticatedUserId ?? userId ?? null;
    const finalEmail = (authenticatedUserEmail ?? email ?? "").trim() || undefined;

    const eventIdsToProcess = eventIds ?? (eventId ? [eventId] : []);

    const bundleEventIdsRaw = body.bundleEventIds ?? body.bundle_event_ids;
    const bundleEventIds = Array.isArray(bundleEventIdsRaw)
      ? bundleEventIdsRaw.filter((id: unknown) => typeof id === "string" && (id as string).trim()).map((id: string) => (id as string).trim())
      : typeof bundleEventIdsRaw === "string" && bundleEventIdsRaw.trim()
        ? bundleEventIdsRaw.split(",").map((id: string) => id.trim()).filter(Boolean)
        : [];

    let returnBase: string;
    try {
      returnBase = resolvePawapayReturnBase();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid payment return URL configuration";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const displayCurrency = Deno.env.get("PAWAPAY_DISPLAY_CURRENCY_LABEL") || "USD";

    const isBundleCreditsPurchase = bundleType === "3_ticket" || bundleType === "5_ticket";
    if (isBundleCreditsPurchase) {
      if (eventIdsToProcess.length > 0 && bundleEventIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "Bundle purchase must not include event IDs" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!finalUserId) {
        return new Response(
          JSON.stringify({ error: "You must be signed in to purchase a ticket bundle" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const expectedCount = bundleType === "3_ticket" ? 3 : 5;
      if (bundleEventIds.length > 0 && bundleEventIds.length !== expectedCount) {
        return new Response(
          JSON.stringify({ error: `${expectedCount}-ticket bundle requires exactly ${expectedCount} events in cart` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (bundleEventIds.length > 0) {
        const { data: eventsExist, error: evErr } = await supabase
          .from("events")
          .select("id")
          .in("id", bundleEventIds);
        if (evErr || !eventsExist || eventsExist.length !== bundleEventIds.length) {
          return new Response(
            JSON.stringify({ error: "One or more events in your cart were not found" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      const bundleBase = bundleType === "3_ticket" ? 7.99 : 12.99;
      const bundleBreakdown = breakdownFromBaseTotal(bundleBase);
      const totalAmount = bundleBreakdown.total;
      const depositId = crypto.randomUUID();
      const fromCart = bundleEventIds.length > 0;
      // Path-only returnUrl: PawaPay rejects many query strings (e.g. returnPath=%2F). Context is stashed client-side.
      let returnUrl: string;
      try {
        returnUrl = normalizePawapayReturnUrl(
          fromCart ? `${returnBase}/ticket-confirmation` : `${returnBase}/dashboard`,
        );
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid return URL" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insErr } = await supabase.from("pawapay_payment_intents").insert({
        deposit_id: depositId,
        metadata: {
          kind: "bundle_credits",
          bundle_type: bundleType,
          user_id: finalUserId,
          email: finalEmail || "",
          phone: phone || "",
          bundle_event_ids: bundleEventIds,
          is_cart: fromCart,
        },
      });
      if (insErr) {
        console.error("pawapay insert intent failed", insErr);
        return new Response(JSON.stringify({ error: "Could not start checkout" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rate = await resolveTicketUsdToLocalRate(supabase);
      const amountStr = formatPawapayAmountFromSiteTotal(totalAmount, rate);
      const localLabel = getPawapayLocalCurrencyLabel();
      const ppRes = await postPawapayV1WidgetSession(baseUrl, apiToken, {
        depositId,
        returnUrl,
        amount: amountStr,
        ...(paymentCountry ? { country: paymentCountry } : {}),
        reason: pawapayTicketPaymentReason(
          bundleBreakdown.subtotal,
          bundleBreakdown.total,
          rate,
          localLabel,
        ),
      });
      const ppData = await ppRes.json().catch(() => ({}));
      if (!ppRes.ok) {
        await supabase.from("pawapay_payment_intents").delete().eq("deposit_id", depositId);
        console.error("[pawapay] paymentpage bundle rejected", {
          returnUrl: returnUrl.slice(0, 400),
          amount: amountStr,
          country: paymentCountry,
          body: ppData,
        });
        const msg = pawapayInitiationErrorMessage(ppData);
        return new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const redirectUrl = (ppData as { redirectUrl?: string }).redirectUrl;
      if (!redirectUrl) {
        await supabase.from("pawapay_payment_intents").delete().eq("deposit_id", depositId);
        return new Response(JSON.stringify({ error: "No redirectUrl from Pawapay" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          url: redirectUrl,
          deposit_id: depositId,
          breakdown: { ...bundleBreakdown, currency: displayCurrency },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (eventIdsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "Event ID(s) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: events, error: eventError } = await supabase
      .from("events")
      .select("*")
      .in("id", eventIdsToProcess);

    if (eventError || !events?.length) {
      return new Response(
        JSON.stringify({ error: "Event(s) not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isLiveReplayBundle = productType === "bundle" && eventIdsToProcess.length === 1;

    if (isLiveReplayBundle) {
      const { data: lrRow } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "live_replay_bundle_enabled")
        .maybeSingle();
      const lrVal = lrRow?.value;
      const bundleOn = lrVal !== false && lrVal !== "false";

      const { data: repRow } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "replays_enabled")
        .maybeSingle();
      const repVal = repRow?.value;
      const replaysOn = repVal !== false && repVal !== "false";

      if (!bundleOn || !replaysOn) {
        return new Response(
          JSON.stringify({
            error: "Live + Replay bundle is not available. Choose live-only or email contact@dreemystar.com.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const onlyReplayTickets = isReplay === true && !isLiveReplayBundle;
    let existingTickets: { event_id: string }[] = [];
    if (finalUserId) {
      let q = supabase.from("tickets").select("event_id").eq("user_id", finalUserId).in("event_id", eventIdsToProcess).eq("status", "active");
      if (onlyReplayTickets) q = q.eq("ticket_type", "replay");
      const { data: byUser } = await q;
      if (byUser?.length) existingTickets = byUser;
    }
    if (finalEmail && existingTickets.length === 0) {
      const norm = finalEmail.toLowerCase().trim();
      let q = supabase.from("tickets").select("event_id").ilike("email", norm).in("event_id", eventIdsToProcess).eq("status", "active");
      if (onlyReplayTickets) q = q.eq("ticket_type", "replay");
      const { data: byEmail } = await q;
      if (byEmail?.length) existingTickets = byEmail;
    }
    if (existingTickets.length > 0) {
      const existingEventIds = existingTickets.map((t) => t.event_id);
      const titles = events.filter((e) => existingEventIds.includes(e.id)).map((e) => e.title || e.id).join(", ");
      return new Response(
        JSON.stringify({ error: `You already have tickets for: ${titles}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseSubtotal = isLiveReplayBundle
      ? 3.49
      : events.reduce((sum, e) => {
          const base = isReplay ? (Number(e.replay_price ?? e.price) || 0) : (Number(e.price) || 0);
          return sum + base;
        }, 0);
    const paymentBreakdown = breakdownFromBaseTotal(baseSubtotal);
    const totalAmount = paymentBreakdown.total;
    if (totalAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid event price" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const paymentAmountRaw = typeof body.paymentAmount === "string" ? body.paymentAmount.trim() : "";
    const paymentCurrencyRaw = typeof body.paymentCurrency === "string"
      ? body.paymentCurrency.trim().toUpperCase()
      : "";
    const paymentCountryAlpha3Raw = typeof body.paymentCountryAlpha3 === "string"
      ? normalizeCountryHint(body.paymentCountryAlpha3.trim())
      : null;

    const isCartBool = !!isCart;
    const useClientPawapayCountryModal =
      paymentAmountRaw.length > 0 &&
      paymentCurrencyRaw.length > 0 &&
      paymentCountryAlpha3Raw !== null &&
      paymentCountryAlpha3Raw.length === 3 &&
      eventIdsToProcess.length >= 1 &&
      !isLiveReplayBundle &&
      (eventIdsToProcess.length === 1 || isCartBool);

    const depositId = crypto.randomUUID();
    let returnUrl: string;
    try {
      returnUrl = normalizePawapayReturnUrl(`${returnBase}/ticket-confirmation`);
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid return URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await supabase.from("pawapay_payment_intents").insert({
      deposit_id: depositId,
      metadata: {
        kind: isLiveReplayBundle ? "live_replay_bundle" : "tickets",
        event_ids: eventIdsToProcess,
        user_id: finalUserId || "",
        email: finalEmail || "",
        phone: phone || "",
        is_cart: isCartBool,
        is_replay: isLiveReplayBundle ? false : !!isReplay,
        is_bundle: !!isLiveReplayBundle,
      },
    });
    if (insErr) {
      console.error("pawapay insert intent failed", insErr);
      return new Response(JSON.stringify({ error: "Could not start checkout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let amountStr: string;
    let ppReason: string;
    let ppMetadata: PawapayV1SessionMetadataItem[] | undefined;
    let sessionCountry: string | null;

    if (useClientPawapayCountryModal) {
      const validated = await validateClientPawapayAmount(
        totalAmount,
        paymentAmountRaw,
        paymentCurrencyRaw,
      );
      if (validated.ok === false) {
        await supabase.from("pawapay_payment_intents").delete().eq("deposit_id", depositId);
        return new Response(JSON.stringify({ error: validated.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amountStr = validated.serverAmount;
      ppReason = clampPawapayPaymentReason(`Pay ${amountStr} ${paymentCurrencyRaw}`);
      ppMetadata = [{ fieldName: "paymentCurrency", fieldValue: paymentCurrencyRaw }];
      sessionCountry = paymentCountryAlpha3Raw;
    } else {
      const rate = await resolveTicketUsdToLocalRate(supabase);
      amountStr = formatPawapayAmountFromSiteTotal(totalAmount, rate);
      const localLabel = getPawapayLocalCurrencyLabel();
      ppReason = pawapayTicketPaymentReason(
        paymentBreakdown.subtotal,
        paymentBreakdown.total,
        rate,
        localLabel,
      );
      ppMetadata = undefined;
      sessionCountry = paymentCountry;
    }

    const ppRes = await postPawapayV1WidgetSession(baseUrl, apiToken, {
      depositId,
      returnUrl,
      amount: amountStr,
      ...(sessionCountry ? { country: sessionCountry } : {}),
      reason: ppReason,
      ...(ppMetadata ? { metadata: ppMetadata } : {}),
    });
    const ppData = await ppRes.json().catch(() => ({}));
    if (!ppRes.ok) {
      await supabase.from("pawapay_payment_intents").delete().eq("deposit_id", depositId);
      console.error("[pawapay] paymentpage rejected", {
        returnUrl: returnUrl.slice(0, 400),
        amount: amountStr,
        country: sessionCountry,
        body: ppData,
      });
      const msg = pawapayInitiationErrorMessage(ppData);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const redirectUrl = (ppData as { redirectUrl?: string }).redirectUrl;
    if (!redirectUrl) {
      await supabase.from("pawapay_payment_intents").delete().eq("deposit_id", depositId);
      return new Response(JSON.stringify({ error: "No redirectUrl from Pawapay" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        url: redirectUrl,
        deposit_id: depositId,
        breakdown: { ...paymentBreakdown, currency: displayCurrency },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
