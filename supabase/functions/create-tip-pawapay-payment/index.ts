import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { validateClientPawapayAmount } from "../_shared/frankfurterUsdRate.ts";
import { resolveTipRecipient, tipRecipientDisplayName } from "../_shared/resolveTipRecipient.ts";
import {
  clampPawapayPaymentReason,
  formatPawapayAmountFromSiteTotal,
  getPawapayLocalCurrencyLabel,
  getPawapayUsdToLocalRate,
  normalizePawapayReturnUrl,
  pawapayInitiationErrorMessage,
  pawapayTipPaymentReason,
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

  return { ok: true, country: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiToken = Deno.env.get("PAWAPAY_API_TOKEN")?.trim();
    const baseUrl = (Deno.env.get("PAWAPAY_BASE_URL") || "https://api.sandbox.pawapay.io").replace(/\/+$/, "");
    if (!apiToken) throw new Error("Missing PAWAPAY_API_TOKEN");

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
        /* guest */
      }
    }

    const body = await req.json();
    const { artistId, amount, message, email, phone, name } = body;

    if (!artistId || !amount) {
      return new Response(
        JSON.stringify({ error: "Artist ID and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tipAmount = parseFloat(amount);
    if (isNaN(tipAmount) || tipAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid tip amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resolved = await resolveTipRecipient(supabase, String(artistId));
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ error: "Artist not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const recipient = resolved.recipient;

    if (recipient.kind === "registered" && authenticatedUserId === recipient.profile.id) {
      return new Response(
        JSON.stringify({ error: "You cannot tip yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const finalUserId = authenticatedUserId || null;
    const finalEmail = authenticatedUserEmail || email || undefined;

    if (!authenticatedUserId) {
      const trimmed = (email && typeof email === "string") ? email.trim() : "";
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return new Response(
          JSON.stringify({ error: "Email is required for guest tips so we can send your receipt." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

    const tipInsert =
      recipient.kind === "registered"
        ? {
          artist_id: recipient.profile.id,
          event_id: null as string | null,
          unregistered_artist_name: null as string | null,
          sender_id: finalUserId,
          sender_email: finalEmail,
          amount: tipAmount,
          message: message || null,
          status: "pending" as const,
        }
        : {
          artist_id: null,
          event_id: recipient.eventId,
          unregistered_artist_name: recipient.displayName,
          sender_id: finalUserId,
          sender_email: finalEmail,
          amount: tipAmount,
          message: message || null,
          status: "pending" as const,
        };

    const { data: tipRecord, error: tipError } = await supabase
      .from("tips")
      .insert(tipInsert)
      .select()
      .single();

    if (tipError || !tipRecord) {
      console.error("Error creating tip record:", tipError);
      return new Response(
        JSON.stringify({ error: "Failed to create tip record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    const depositId = crypto.randomUUID();
    let returnUrl: string;
    try {
      returnUrl = normalizePawapayReturnUrl(`${returnBase}/tip-confirmation`);
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid return URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await supabase.from("pawapay_payment_intents").insert({
      deposit_id: depositId,
      metadata: {
        kind: "tip",
        tip_id: tipRecord.id,
        artist_id: recipient.kind === "registered" ? recipient.profile.id : "",
        event_id: recipient.kind === "unregistered" ? recipient.eventId : "",
        unregistered_artist_name: recipient.kind === "unregistered" ? recipient.displayName : "",
        user_id: finalUserId || "",
        email: finalEmail || "",
        phone: phone || "",
      },
    });
    if (insErr) {
      console.error("pawapay tip intent insert failed", insErr);
      return new Response(JSON.stringify({ error: "Could not start checkout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("tips")
      .update({ pawapay_deposit_id: depositId })
      .eq("id", tipRecord.id);

    const paymentAmountRaw = typeof body.paymentAmount === "string" ? body.paymentAmount.trim() : "";
    const paymentCurrencyRaw = typeof body.paymentCurrency === "string"
      ? body.paymentCurrency.trim().toUpperCase()
      : "";
    const paymentCountryAlpha3Raw = typeof body.paymentCountryAlpha3 === "string"
      ? normalizeCountryHint(body.paymentCountryAlpha3.trim())
      : null;

    const useClientPawapayCountryModal =
      paymentAmountRaw.length > 0 &&
      paymentCurrencyRaw.length > 0 &&
      paymentCountryAlpha3Raw !== null &&
      paymentCountryAlpha3Raw.length === 3;

    const artistShort = tipRecipientDisplayName(recipient)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 18) || "artist";

    let amountStr: string;
    let ppReason: string;
    let ppMetadata: PawapayV1SessionMetadataItem[] | undefined;
    let sessionCountry: string | null;

    if (useClientPawapayCountryModal) {
      const validated = await validateClientPawapayAmount(
        tipAmount,
        paymentAmountRaw,
        paymentCurrencyRaw,
      );
      if (validated.ok === false) {
        await supabase.from("pawapay_payment_intents").delete().eq("deposit_id", depositId);
        await supabase.from("tips").update({ pawapay_deposit_id: null }).eq("id", tipRecord.id);
        return new Response(JSON.stringify({ error: validated.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amountStr = validated.serverAmount;
      ppReason = clampPawapayPaymentReason(`Tip ${amountStr} ${paymentCurrencyRaw} · ${artistShort}`);
      ppMetadata = [{ fieldName: "paymentCurrency", fieldValue: paymentCurrencyRaw }];
      sessionCountry = paymentCountryAlpha3Raw;
    } else {
      amountStr = formatPawapayAmountFromSiteTotal(tipAmount);
      ppReason = pawapayTipPaymentReason(
        tipAmount,
        getPawapayUsdToLocalRate(),
        getPawapayLocalCurrencyLabel(),
        artistShort,
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
      await supabase.from("tips").update({ pawapay_deposit_id: null }).eq("id", tipRecord.id);
      console.error("[pawapay] paymentpage tip rejected", {
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
      await supabase.from("tips").update({ pawapay_deposit_id: null }).eq("id", tipRecord.id);
      return new Response(JSON.stringify({ error: "No redirectUrl from Pawapay" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ url: redirectUrl, deposit_id: depositId, tipId: tipRecord.id }),
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
