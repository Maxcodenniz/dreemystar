import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { resolveTipRecipient, tipRecipientDisplayName } from "../_shared/resolveTipRecipient.ts";

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
    if (!publicKey) throw new Error("Missing DUSUPAY_PUBLIC_KEY");

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

    const body = await req.json();
    const { artistId, amount, message, email, phone, name } = body;

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

    let siteUrl = Deno.env.get("SITE_URL") || "https://prodreemystar.netlify.app";
    if (siteUrl && !siteUrl.startsWith("http://") && !siteUrl.startsWith("https://")) {
      siteUrl = `https://${siteUrl}`;
    }
    siteUrl = siteUrl.replace(/\/+$/, "");

    const merchantRef = randomMerchantRef();
    const returnUrl =
      `${siteUrl}/tip-confirmation?provider=dusupay&merchant_ref=${encodeURIComponent(merchantRef)}&tip_id=${tipRecord.id}`;

    const { error: insErr } = await supabase.from("dusupay_payment_intents").insert({
      merchant_reference: merchantRef,
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
      console.error("dusupay tip intent insert failed", insErr);
      return new Response(JSON.stringify({ error: "Could not start checkout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("tips")
      .update({ dusupay_merchant_reference: merchantRef })
      .eq("id", tipRecord.id);

    const msisdn = normalizeMsisdn(phone, defaultMsisdn);
    const dusRes = await fetch(`${apiBase}/collections/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "1",
        "public-key": publicKey,
      },
      body: JSON.stringify({
        merchant_reference: merchantRef,
        transaction_method: "MOBILE_MONEY",
        currency,
        amount: toDusupayAmountUnits(tipAmount),
        provider_code: providerCode,
        msisdn,
        customer_email: finalEmail,
        customer_name: typeof name === "string" && name.trim() ? String(name).trim().slice(0, 80) : undefined,
        description: `Tip — ${tipRecipientDisplayName(recipient)}`.slice(0, 120),
        charge_customer: false,
        allow_final_status_change: true,
        mobile_money_hpp: true,
        redirect_url: returnUrl,
      }),
    });
    const dusData = await dusRes.json().catch(() => ({})) as { data?: { payment_url?: string }; message?: string };
    if (!dusRes.ok) {
      await supabase.from("dusupay_payment_intents").delete().eq("merchant_reference", merchantRef);
      await supabase.from("tips").update({ dusupay_merchant_reference: null }).eq("id", tipRecord.id);
      return new Response(JSON.stringify({ error: dusData.message || "DusuPay request failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const paymentUrl = dusData.data?.payment_url;
    if (!paymentUrl) {
      await supabase.from("dusupay_payment_intents").delete().eq("merchant_reference", merchantRef);
      await supabase.from("tips").update({ dusupay_merchant_reference: null }).eq("id", tipRecord.id);
      return new Response(JSON.stringify({ error: "No payment URL from DusuPay" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ url: paymentUrl, merchant_ref: merchantRef, tipId: tipRecord.id }),
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
