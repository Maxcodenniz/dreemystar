import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "You must be signed in to use a bundle credit" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : null;
    if (!eventId) {
      return new Response(JSON.stringify({ error: "eventId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure event exists
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing live ticket
    const { data: existingTicket } = await supabase
      .from("tickets")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("ticket_type", "live")
      .maybeSingle();
    if (existingTicket) {
      return new Response(JSON.stringify({ error: "You already have a live ticket for this event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find a bundle row with at least one credit (prefer 5_ticket then 3_ticket)
    const { data: creditsRows, error: creditsErr } = await supabase
      .from("user_bundle_credits")
      .select("id, bundle_type, credits_remaining")
      .eq("user_id", user.id)
      .gt("credits_remaining", 0)
      .order("bundle_type", { ascending: false });
    if (creditsErr || !creditsRows?.length) {
      return new Response(JSON.stringify({ error: "No bundle credits available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = creditsRows[0];

    // Decrement credit
    const { error: updateErr } = await supabase
      .from("user_bundle_credits")
      .update({
        credits_remaining: row.credits_remaining - 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to use credit" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create live ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        event_id: eventId,
        user_id: user.id,
        email: user.email ?? null,
        phone: null,
        stripe_payment_id: null,
        stripe_session_id: null,
        status: "active",
        ticket_type: "live",
      })
      .select("id, event_id")
      .single();
    if (ticketErr || !ticket) {
      // Rollback credit decrement
      await supabase
        .from("user_bundle_credits")
        .update({
          credits_remaining: row.credits_remaining,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return new Response(JSON.stringify({ error: "Failed to create ticket" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, ticketId: ticket.id, eventId: ticket.event_id, creditsRemaining: row.credits_remaining - 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
