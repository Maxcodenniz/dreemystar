import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { loadCapabilityState } from "../_shared/mobileMoney/capabilityService.ts";
import {
  MobileMoneyError,
  MobileMoneyTemporarilyUnavailableError,
  UnsupportedOperatorOrCountryError,
} from "../_shared/mobileMoney/errors.ts";
import { ISO2_TO_DUSUPAY_CURRENCY, iso2ToAlpha3 } from "../_shared/mobileMoney/isoCountry.ts";
import {
  getMobileMoneyProvider,
  normalizeCountryCode,
  normalizeOperatorKey,
} from "../_shared/mobileMoney/router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.json();
    const flat =
      rawBody && typeof rawBody === "object" && rawBody !== null && "body" in rawBody &&
        typeof (rawBody as { body?: unknown }).body === "object" && (rawBody as { body: unknown }).body !== null
        ? (rawBody as { body: Record<string, unknown> }).body
        : rawBody as Record<string, unknown>;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const toggles = await readPaymentToggles(supabase);

    if (!toggles.mobileMoney) {
      return new Response(JSON.stringify({ error: "Mobile money payments are disabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!toggles.pawapay && !toggles.dusupay) {
      return new Response(JSON.stringify({ error: "No mobile money provider is enabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const forwardTo = async (fn: string, bodyOverride?: Record<string, unknown>) => {
      const inner: Record<string, unknown> = bodyOverride ? { ...bodyOverride } : { ...flat };
      const forwardPayload =
        rawBody && typeof rawBody === "object" && rawBody !== null && "body" in rawBody &&
          typeof (rawBody as { body?: unknown }).body === "object"
          ? { ...(rawBody as Record<string, unknown>), body: inner }
          : inner;
      const base = supabaseUrl.replace(/\/+$/, "");
      const url = `${base}/functions/v1/${fn}`;
      const auth = req.headers.get("Authorization") ?? "";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          apikey: anonKey,
        },
        body: JSON.stringify(forwardPayload),
      });
      const text = await res.text();
      const ct = res.headers.get("Content-Type") || "application/json";
      return new Response(text, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": ct },
      });
    };

    const countryRaw = flat.countryCode ?? flat.mobileMoneyCountry;
    const operatorRaw = flat.mobileOperator ?? flat.mobile_money_operator;
    const cc = normalizeCountryCode(typeof countryRaw === "string" ? countryRaw : "");
    const operator = typeof operatorRaw === "string" ? operatorRaw.trim() : "";
    const hasWalletRouting = cc.length === 2 && operator.length > 0;

    if (!hasWalletRouting && toggles.pawapay) {
      return await forwardTo("create-tip-pawapay-payment");
    }

    if (!hasWalletRouting) {
      if (cc.length !== 2) {
        return new Response(
          JSON.stringify({ error: "countryCode is required (ISO 3166-1 alpha-2, e.g. GH)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "mobileOperator is required (e.g. MTN, Vodafone)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { cache, freshness, warnings } = await loadCapabilityState(supabase);
    for (const w of warnings) console.warn("[tip-mobile-money]", w);

    let provider: "pawapay" | "dusupay";
    try {
      provider = getMobileMoneyProvider(cc, operator, {
        mobileMoneyEnabled: toggles.mobileMoney,
        isPawaPayEnabled: toggles.pawapay,
        isDusuPayEnabled: toggles.dusupay,
      }, cache, freshness);
    } catch (e) {
      if (e instanceof MobileMoneyTemporarilyUnavailableError) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (e instanceof UnsupportedOperatorOrCountryError) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (e instanceof MobileMoneyError) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }

    if (toggles.pawapay && toggles.dusupay && provider === "dusupay") {
      console.warn(
        "[tip-mobile-money] Routed to DusuPay (PawaPay does not support this country/operator or cache unavailable).",
        { countryCode: cc, operator },
      );
    }

    const inner: Record<string, unknown> = { ...flat };
    const a3 = iso2ToAlpha3(cc);
    if (a3) {
      inner.country = a3;
      inner.paymentCountry = a3;
      inner.payment_country = a3;
    }

    if (provider === "dusupay") {
      const opKey = normalizeOperatorKey(operator);
      const code = cache.dusupayProviderCodes[cc]?.[opKey];
      if (!code) {
        return new Response(
          JSON.stringify({
            error:
              "DusuPay provider code missing for this selection. Run refresh-mobile-money-capabilities or check DUSUPAY_CAPABILITY_QUERIES.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      inner.dusupayProviderCode = code;
      const cur = ISO2_TO_DUSUPAY_CURRENCY[cc];
      if (cur && !inner.dusupayCurrency && !inner.dusupay_currency) {
        inner.dusupayCurrency = cur;
      }
    }

    const fn = provider === "pawapay" ? "create-tip-pawapay-payment" : "create-tip-dusupay-payment";
    return await forwardTo(fn, inner);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
