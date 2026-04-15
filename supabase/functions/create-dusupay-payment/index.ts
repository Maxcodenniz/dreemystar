import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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

function dusupayForbiddenResponse(): Response {
  return new Response(JSON.stringify({ error: "DusuPay payments are disabled for this platform." }), {
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

function sanitizeCheckoutReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const p = raw.trim();
  if (!p.startsWith("/") || p.length > 256) return "";
  if (p.startsWith("//") || p.includes("..")) return "";
  if (/[\s<>"'\\]/.test(p)) return "";
  if (p.includes(":")) return "";
  return p;
}

function randomMerchantRef(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toDusupayAmountUnits(siteTotalUsd: number): number {
  const rate = parseFloat(Deno.env.get("DUSUPAY_USD_TO_LOCAL_RATE") || "1");
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid DUSUPAY_USD_TO_LOCAL_RATE");
  }
  return Math.max(1, Math.round(siteTotalUsd * rate));
}

function normalizeMsisdn(phoneRaw: unknown, fallbackDigits: string): string {
  const d = typeof phoneRaw === "string" ? phoneRaw.replace(/\D/g, "") : "";
  if (d.length >= 10) return d;
  return fallbackDigits.replace(/\D/g, "");
}

async function dusupayInitialize(args: {
  apiBase: string;
  publicKey: string;
  merchantRef: string;
  amount: number;
  currency: string;
  providerCode: string;
  msisdn: string;
  redirectUrl: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<{ payment_url?: string; message?: string }> {
  const dusRes = await fetch(`${args.apiBase}/collections/initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "1",
      "public-key": args.publicKey,
    },
    body: JSON.stringify({
      merchant_reference: args.merchantRef,
      transaction_method: "MOBILE_MONEY",
      currency: args.currency,
      amount: args.amount,
      provider_code: args.providerCode,
      msisdn: args.msisdn,
      customer_email: args.customerEmail,
      customer_name: args.customerName,
      description: "Dreemystar tickets",
      charge_customer: false,
      allow_final_status_change: true,
      mobile_money_hpp: true,
      redirect_url: args.redirectUrl,
    }),
  });
  const body = await dusRes.json().catch(() => ({})) as {
    data?: { payment_url?: string };
    message?: string;
  };
  if (!dusRes.ok) {
    return { message: body.message || `DusuPay error (${dusRes.status})` };
  }
  return { payment_url: body.data?.payment_url };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const publicKey = Deno.env.get("DUSUPAY_PUBLIC_KEY")?.trim();
    const apiBase = (Deno.env.get("DUSUPAY_API_BASE") || "https://sandboxapi.dusupay.com").replace(/\/+$/, "");
    const defaultCurrency = (Deno.env.get("DUSUPAY_CURRENCY") || "UGX").trim();
    const defaultProviderCode = (Deno.env.get("DUSUPAY_PROVIDER_CODE") || "mtn_ug").trim();
    const defaultMsisdn = (Deno.env.get("DUSUPAY_DEFAULT_MSISDN") || "256777000001").trim();
    if (!publicKey) {
      throw new Error("Missing DUSUPAY_PUBLIC_KEY");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const toggles = await readPaymentToggles(supabase);
    if (!toggles.mobileMoney || !toggles.dusupay) {
      const fr = dusupayForbiddenResponse();
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

    const rawBody = await req.json();
    const body = rawBody && typeof rawBody === "object" && rawBody.body && typeof rawBody.body === "object"
      ? rawBody.body
      : rawBody;
    const { eventId, eventIds, email, phone, name, isCart, userId, isReplay, productType } = body;
    const returnPathSanitized = sanitizeCheckoutReturnPath(body.returnPath ?? body.return_path);
    const returnPathQuery = returnPathSanitized
      ? `&returnPath=${encodeURIComponent(returnPathSanitized)}`
      : "";
    const bundleTypeRaw = body.bundleType ?? body.bundle_type;
    const bundleType = typeof bundleTypeRaw === "string" ? bundleTypeRaw.trim() : undefined;

    const bodyProvider =
      (typeof body.dusupayProviderCode === "string" && body.dusupayProviderCode.trim())
        ? body.dusupayProviderCode.trim()
        : (typeof body.providerCode === "string" && body.providerCode.trim())
        ? body.providerCode.trim()
        : (typeof body.provider_code === "string" && body.provider_code.trim())
        ? body.provider_code.trim()
        : "";
    const bodyCurrency =
      (typeof body.dusupayCurrency === "string" && body.dusupayCurrency.trim())
        ? body.dusupayCurrency.trim()
        : (typeof body.dusupay_currency === "string" && body.dusupay_currency.trim())
        ? body.dusupay_currency.trim()
        : "";
    const providerCode = bodyProvider || defaultProviderCode;
    const currency = bodyCurrency || defaultCurrency;

    const finalUserId = authenticatedUserId ?? userId ?? null;
    const finalEmail = (authenticatedUserEmail ?? email ?? "").trim() || undefined;

    const eventIdsToProcess = eventIds ?? (eventId ? [eventId] : []);

    const bundleEventIdsRaw = body.bundleEventIds ?? body.bundle_event_ids;
    const bundleEventIds = Array.isArray(bundleEventIdsRaw)
      ? bundleEventIdsRaw.filter((id: unknown) => typeof id === "string" && (id as string).trim()).map((id: string) => (id as string).trim())
      : typeof bundleEventIdsRaw === "string" && bundleEventIdsRaw.trim()
        ? bundleEventIdsRaw.split(",").map((id: string) => id.trim()).filter(Boolean)
        : [];

    let siteUrl = Deno.env.get("SITE_URL") || "https://prodreemystar.netlify.app";
    if (siteUrl && !siteUrl.startsWith("http://") && !siteUrl.startsWith("https://")) {
      siteUrl = `https://${siteUrl}`;
    }
    siteUrl = siteUrl.replace(/\/+$/, "");

    const msisdn = normalizeMsisdn(phone, defaultMsisdn);

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
      const merchantRef = randomMerchantRef();
      const fromCart = bundleEventIds.length > 0;
      const returnUrl = fromCart
        ? `${siteUrl}/ticket-confirmation?provider=dusupay&merchant_ref=${encodeURIComponent(merchantRef)}&cart=true&bundle=true${returnPathQuery}`
        : `${siteUrl}/dashboard?bundle=success&provider=dusupay&merchant_ref=${encodeURIComponent(merchantRef)}`;

      const { error: insErr } = await supabase.from("dusupay_payment_intents").insert({
        merchant_reference: merchantRef,
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
        console.error("dusupay insert intent failed", insErr);
        return new Response(JSON.stringify({ error: "Could not start checkout" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const init = await dusupayInitialize({
        apiBase,
        publicKey,
        merchantRef,
        amount: toDusupayAmountUnits(totalAmount),
        currency,
        providerCode,
        msisdn,
        redirectUrl: returnUrl,
        customerEmail: finalEmail,
        customerName: typeof name === "string" ? name : undefined,
      });
      if (!init.payment_url) {
        await supabase.from("dusupay_payment_intents").delete().eq("merchant_reference", merchantRef);
        return new Response(JSON.stringify({ error: init.message || "DusuPay did not return a payment URL" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          url: init.payment_url,
          merchant_ref: merchantRef,
          breakdown: { ...bundleBreakdown, currency: "USD" },
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

    const merchantRef = randomMerchantRef();
    const isCartBool = !!isCart;
    const returnUrl = isCartBool
      ? `${siteUrl}/ticket-confirmation?provider=dusupay&merchant_ref=${encodeURIComponent(merchantRef)}&cart=true${returnPathQuery}`
      : `${siteUrl}/ticket-confirmation?provider=dusupay&merchant_ref=${encodeURIComponent(merchantRef)}&eventId=${eventIdsToProcess[0]}${returnPathQuery}`;

    const { error: insErr } = await supabase.from("dusupay_payment_intents").insert({
      merchant_reference: merchantRef,
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
      console.error("dusupay insert intent failed", insErr);
      return new Response(JSON.stringify({ error: "Could not start checkout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const init = await dusupayInitialize({
      apiBase,
      publicKey,
      merchantRef,
      amount: toDusupayAmountUnits(totalAmount),
      currency,
      providerCode,
      msisdn,
      redirectUrl: returnUrl,
      customerEmail: finalEmail,
      customerName: typeof name === "string" ? name : undefined,
    });
    if (!init.payment_url) {
      await supabase.from("dusupay_payment_intents").delete().eq("merchant_reference", merchantRef);
      return new Response(JSON.stringify({ error: init.message || "DusuPay did not return a payment URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        url: init.payment_url,
        merchant_ref: merchantRef,
        breakdown: { ...paymentBreakdown, currency: "USD" },
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
