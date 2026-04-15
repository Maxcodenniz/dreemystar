import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey, hmac-signature, HMAC-Signature",
};

function parseHmacHeader(h: string | null): { s?: string } {
  if (!h) return {};
  const o: Record<string, string> = {};
  for (const part of h.split(",")) {
    const eq = part.indexOf("=");
    if (eq > 0) o[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return { s: o["s"] };
}

async function verifyDusupayHmac(signingKey: string, strPayload: string, hmacHeader: string): Promise<boolean> {
  const { s } = parseHmacHeader(hmacHeader);
  if (!s || !signingKey) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(strPayload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const signingKey = Deno.env.get("DUSUPAY_HMAC_SIGNING_KEY")?.trim();
  const hmacHeader =
    req.headers.get("hmac-signature") || req.headers.get("HMAC-Signature") || req.headers.get("Hmac-Signature") || "";

  let payload: { event?: string; payload?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const event = typeof payload.event === "string" ? payload.event : "";
  const p = payload.payload && typeof payload.payload === "object" ? payload.payload : {};
  const merchantRef = typeof p.merchant_reference === "string" ? p.merchant_reference.trim() : "";
  const internalRef = typeof p.internal_reference === "string" ? p.internal_reference.trim() : "";
  const txType = typeof p.transaction_type === "string" ? p.transaction_type.trim() : "";
  const txStatus = typeof p.transaction_status === "string" ? p.transaction_status.trim() : "";

  if (signingKey) {
    const strPayload = `${event}:${merchantRef}:${internalRef}:${txType}:${txStatus}`;
    const ok = await verifyDusupayHmac(signingKey, strPayload, hmacHeader);
    if (!ok) {
      console.warn("dusupay-webhook: invalid HMAC");
      return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } else {
    console.error("CRITICAL: DUSUPAY_HMAC_SIGNING_KEY is not set — rejecting webhook");
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!merchantRef) {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    console.error("dusupay webhook: missing Supabase config");
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: intentRow, error: intentErr } = await supabase
    .from("dusupay_payment_intents")
    .select("merchant_reference, metadata, processed_at")
    .eq("merchant_reference", merchantRef)
    .maybeSingle();

  if (intentErr || !intentRow) {
    console.warn("dusupay webhook: unknown merchant_reference", merchantRef);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (intentRow.processed_at) {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (event !== "transaction.completed" || txStatus !== "COMPLETED") {
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const meta = (intentRow.metadata || {}) as Record<string, unknown>;
  const kind = typeof meta.kind === "string" ? meta.kind : "";

  const markProcessed = async () => {
    await supabase
      .from("dusupay_payment_intents")
      .update({ processed_at: new Date().toISOString() })
      .eq("merchant_reference", merchantRef);
  };

  if (kind === "bundle_credits") {
    const bundleType = (meta.bundle_type as string) || "";
    const userId = (meta.user_id as string)?.trim() || null;
    if (bundleType !== "3_ticket" && bundleType !== "5_ticket") {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!userId) {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const creditsToAdd = bundleType === "3_ticket" ? 3 : 5;
    const rawBundleEvents = meta.bundle_event_ids;
    const bundleEventIdsStr = Array.isArray(rawBundleEvents)
      ? (rawBundleEvents as string[]).map((id) => String(id).trim()).filter(Boolean).join(",")
      : (typeof rawBundleEvents === "string" ? rawBundleEvents : "") || "";
    const eventIdsToApply = bundleEventIdsStr
      ? bundleEventIdsStr.split(",").map((id: string) => id.trim()).filter(Boolean).slice(0, creditsToAdd)
      : [];
    const email = (meta.email as string)?.trim() || null;
    const phone = (meta.phone as string)?.trim() || null;

    const { data: existing } = await supabase
      .from("user_bundle_credits")
      .select("id, credits_remaining")
      .eq("user_id", userId)
      .eq("bundle_type", bundleType)
      .maybeSingle();
    let rowId: string;
    let newRemaining: number;
    if (existing) {
      newRemaining = existing.credits_remaining + creditsToAdd;
      await supabase
        .from("user_bundle_credits")
        .update({
          credits_remaining: newRemaining,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      rowId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("user_bundle_credits")
        .insert({
          user_id: userId,
          bundle_type: bundleType,
          credits_remaining: creditsToAdd,
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        console.error("dusupay bundle: insert credits failed", insErr);
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      rowId = inserted.id;
      newRemaining = creditsToAdd;
    }

    let ticketsCreated = 0;
    const customerEmail = email || undefined;
    for (const eventId of eventIdsToApply) {
      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          event_id: eventId,
          user_id: userId,
          email: customerEmail || null,
          phone: phone || null,
          stripe_payment_id: null,
          stripe_session_id: null,
          dusupay_merchant_reference: merchantRef,
          status: "active",
          ticket_type: "live",
        })
        .select("id, event_id")
        .single();
      if (!ticketErr && ticket) {
        ticketsCreated++;
        if (customerEmail) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-ticket-confirmation`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
              body: JSON.stringify({ ticketId: ticket.id, eventId: ticket.event_id, email: customerEmail }),
            });
          } catch (e) {
            console.warn("dusupay send-ticket-confirmation error", e);
          }
        }
      }
    }
    if (ticketsCreated > 0) {
      await supabase
        .from("user_bundle_credits")
        .update({
          credits_remaining: newRemaining - ticketsCreated,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId);
    }

    await markProcessed();
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (kind === "tip") {
    const tipId = typeof meta.tip_id === "string" ? meta.tip_id : "";
    if (!tipId) {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tipRow } = await supabase.from("tips").select("id, status").eq("id", tipId).maybeSingle();
    if (tipRow?.status === "completed") {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: tipUpdateError } = await supabase
      .from("tips")
      .update({
        status: "completed",
        dusupay_merchant_reference: merchantRef,
        completed_at: new Date().toISOString(),
      })
      .eq("id", tipId);

    if (tipUpdateError) {
      console.error("dusupay tip update failed", tipUpdateError);
    } else {
      try {
        const notifRes = await fetch(`${supabaseUrl}/functions/v1/send-tip-notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ tip_id: tipId }),
        });
        if (!notifRes.ok) {
          console.error("send-tip-notifications failed:", notifRes.status, await notifRes.text());
        }
      } catch (e) {
        console.error("send-tip-notifications request failed:", e);
      }
    }

    await markProcessed();
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const eventIdsStr = Array.isArray(meta.event_ids)
    ? (meta.event_ids as string[]).filter(Boolean).join(",")
    : (meta.event_ids as string) || "";
  const eventIds = eventIdsStr ? eventIdsStr.split(",").map((id) => id.trim()).filter(Boolean) : [];
  if (eventIds.length === 0) {
    console.error("dusupay: no event_ids in intent");
    await markProcessed();
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: existingTickets } = await supabase
    .from("tickets")
    .select("id")
    .eq("dusupay_merchant_reference", merchantRef)
    .limit(1);
  if (existingTickets && existingTickets.length > 0) {
    await markProcessed();
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userId = (meta.user_id as string)?.trim() || null;
  const email = (meta.email as string)?.trim() || null;
  const phone = (meta.phone as string)?.trim() || null;
  const isReplay = meta.is_replay === true || meta.is_replay === "true";
  const isBundle = meta.is_bundle === true || meta.is_bundle === "true";
  const ticketType = isReplay ? "replay" : "live";
  const typesToCreate: ("live" | "replay")[] = isBundle ? ["live", "replay"] : [ticketType];

  let resolvedUserId = userId;
  if (!resolvedUserId && email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    resolvedUserId = profile?.id ?? null;
  }

  const tickets: { id: string; event_id: string }[] = [];
  for (const eventId of eventIds) {
    for (const t of typesToCreate) {
      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          event_id: eventId,
          user_id: resolvedUserId,
          email: email || null,
          phone: phone || null,
          stripe_payment_id: null,
          stripe_session_id: null,
          dusupay_merchant_reference: merchantRef,
          status: "active",
          ticket_type: t,
        })
        .select("id, event_id")
        .single();

      if (error) {
        console.error(`dusupay ticket insert failed for ${eventId} (${t}):`, error);
      } else if (ticket) {
        tickets.push(ticket);
      }
    }
  }

  if (resolvedUserId && phone) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", resolvedUserId)
      .single();
    if (profile && !profile.phone) {
      await supabase.from("profiles").update({ phone }).eq("id", resolvedUserId);
    }
  }

  const customerEmail = email || undefined;
  if (tickets.length > 0 && customerEmail) {
    const fnUrl = `${supabaseUrl}/functions/v1/send-ticket-confirmation`;
    for (const ticket of tickets) {
      try {
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            ticketId: ticket.id,
            eventId: ticket.event_id,
            email: customerEmail,
          }),
        });
      } catch (e) {
        console.error("dusupay send-ticket-confirmation error", e);
      }
    }
  }

  await markProcessed();
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
