import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

/**
 * Pawapay POSTs here when a deposit reaches a final status.
 * Configure dashboard callback URL:
 *   https://<project-ref>.supabase.co/functions/v1/pawapay-deposit-callback?token=<PAWAPAY_CALLBACK_TOKEN>
 */

function verifyCallbackToken(req: Request): boolean {
  const expected = Deno.env.get("PAWAPAY_CALLBACK_TOKEN")?.trim();
  if (!expected) {
    console.error("CRITICAL: PAWAPAY_CALLBACK_TOKEN is not set");
    return false;
  }
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return false;
  }
  const token = url.searchParams.get("token");
  return token === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!verifyCallbackToken(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const depositIdRaw = payload.depositId ?? payload.deposit_id;
  const depositId = typeof depositIdRaw === "string" ? depositIdRaw.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.toUpperCase() : "";

  if (!depositId) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    console.error("pawapay callback: missing Supabase config");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: intentRow, error: intentErr } = await supabase
    .from("pawapay_payment_intents")
    .select("deposit_id, metadata, processed_at")
    .eq("deposit_id", depositId)
    .maybeSingle();

  if (intentErr || !intentRow) {
    console.warn("pawapay callback: unknown depositId", depositId);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (intentRow.processed_at) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (status !== "COMPLETED") {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const meta = (intentRow.metadata || {}) as Record<string, unknown>;
  const kind = typeof meta.kind === "string" ? meta.kind : "";

  const markProcessed = async () => {
    await supabase
      .from("pawapay_payment_intents")
      .update({ processed_at: new Date().toISOString() })
      .eq("deposit_id", depositId);
  };

  // --- Bundle credits ---
  if (kind === "bundle_credits") {
    const bundleType = (meta.bundle_type as string) || "";
    const userId = (meta.user_id as string)?.trim() || null;
    if (bundleType !== "3_ticket" && bundleType !== "5_ticket") {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!userId) {
      console.warn("pawapay bundle: no user_id");
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
        console.error("pawapay bundle: insert credits failed", insErr);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
          pawapay_deposit_id: depositId,
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
            console.warn("pawapay send-ticket-confirmation error", e);
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
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Tip ---
  if (kind === "tip") {
    const tipId = typeof meta.tip_id === "string" ? meta.tip_id : "";
    if (!tipId) {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: tipRow } = await supabase.from("tips").select("id, status").eq("id", tipId).maybeSingle();
    if (tipRow?.status === "completed") {
      await markProcessed();
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: tipUpdateError } = await supabase
      .from("tips")
      .update({
        status: "completed",
        pawapay_deposit_id: depositId,
        completed_at: new Date().toISOString(),
      })
      .eq("id", tipId);

    if (tipUpdateError) {
      console.error("pawapay tip update failed", tipUpdateError);
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
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Tickets (including live+replay bundle) ---
  const eventIdsStr = Array.isArray(meta.event_ids)
    ? (meta.event_ids as string[]).filter(Boolean).join(",")
    : (meta.event_ids as string) || "";
  const eventIds = eventIdsStr ? eventIdsStr.split(",").map((id) => id.trim()).filter(Boolean) : [];
  if (eventIds.length === 0) {
    console.error("pawapay: no event_ids in intent");
    await markProcessed();
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: existingTickets } = await supabase
    .from("tickets")
    .select("id")
    .eq("pawapay_deposit_id", depositId)
    .limit(1);
  if (existingTickets && existingTickets.length > 0) {
    await markProcessed();
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
          pawapay_deposit_id: depositId,
          status: "active",
          ticket_type: t,
        })
        .select("id, event_id")
        .single();

      if (error) {
        console.error(`pawapay ticket insert failed for ${eventId} (${t}):`, error);
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
        console.error("pawapay send-ticket-confirmation error", e);
      }
    }
  }

  await markProcessed();
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
